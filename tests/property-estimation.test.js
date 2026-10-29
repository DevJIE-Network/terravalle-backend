const assert = require('node:assert/strict');
const { test } = require('node:test');
const database = require('../src/config/database');
const propertyRepository = require('../src/repositories/property.repository');
const serviceRepository = require('../src/repositories/service.repository');
const estimationRepository = require('../src/repositories/estimation.repository');
const aiExplainer = require('../src/services/estimation/ai-explainer');
const estimationService = require('../src/services/estimation/estimation.service');
const model = require('../src/services/estimation/valuation-model');
const { requestEstimation, listEstimations } = require('../src/controllers/estimation.controller');

const OWNER_ID = '101';
const PROPERTY = {
  id: '7',
  ownerId: OWNER_ID,
  propertyTypeId: 2,
  title: 'Casa en Tula',
  publicationPrice: 1500000,
  status: 'draft',
};

const CASA = { id: 2, name: 'Casa', isActive: true };
const CHARACTERISTICS = {
  propertyId: '7',
  landArea: 160,
  hasConstruction: true,
  builtArea: 120,
  bedrooms: 3,
  bathrooms: 2,
  floors: 2,
  parkingSpaces: 1,
  constructionAge: 8,
  generalCondition: 'bueno',
  constructionQuality: 'media',
};
const LOCATION = {
  propertyId: '7',
  municipality: 'Tula de Allende',
  state: 'Hidalgo',
  postalCode: '42800',
  latitude: 20.053,
  longitude: -99.343,
};
const REFERENCE = {
  landPriceM2: 2125,
  constructionPriceM2: 7650,
  level: 'state',
  source: 'Parámetro inicial TerraValle (por calibrar con fuentes oficiales)',
};
const SERVICES = ['Agua potable', 'Electricidad', 'Drenaje', 'Internet'].map((name, i) => ({ id: i + 1, name }));
const NEARBY = [
  { category: { id: 1, name: 'Escuela' }, approximateDistanceM: 400 },
  { category: { id: 2, name: 'Hospital' }, approximateDistanceM: 3000 },
  { category: { id: 4, name: 'Supermercado' }, approximateDistanceM: null },
];

const INPUT = {
  propertyType: CASA,
  characteristics: CHARACTERISTICS,
  location: LOCATION,
  services: SERVICES,
  nearbyPlaces: NEARBY,
  referencePrice: REFERENCE,
  comparables: [],
};

const comparable = (price, { builtArea = 120, distanceM = 500, quality = 'media' } = {}) => ({
  publicationPrice: price,
  landArea: 150,
  hasConstruction: true,
  builtArea,
  constructionQuality: quality,
  distanceM,
});

const factor = (result, name) => result.factors.find((item) => item.name === name);

// ---------------------------------------------------------------- Modelo: datos mínimos (CA2)

test('HU-009 CA2 una propiedad completa no tiene datos faltantes', () => {
  assert.deepEqual(model.findMissingData(INPUT), []);
});

test('HU-009 CA2 informa qué datos faltan antes de estimar', () => {
  const sinDatos = model.findMissingData({ characteristics: null, location: null });
  assert.deepEqual(
    sinDatos.map((item) => item.field),
    ['characteristics', 'location'],
  );
  assert.match(sinDatos[0].message, /superficie del terreno/);
  assert.match(sinDatos[1].message, /municipio y el estado/);

  const sinConstruida = model.findMissingData({
    characteristics: { ...CHARACTERISTICS, builtArea: null },
    location: LOCATION,
  });
  assert.deepEqual(sinConstruida.map((item) => item.field), ['builtArea']);

  const sinEstado = model.findMissingData({
    characteristics: CHARACTERISTICS,
    location: { municipality: 'Tula de Allende', state: '  ' },
  });
  assert.deepEqual(sinEstado.map((item) => item.field), ['location']);

  const terrenoCero = model.findMissingData({
    characteristics: { ...CHARACTERISTICS, landArea: 0 },
    location: LOCATION,
  });
  assert.deepEqual(terrenoCero.map((item) => item.field), ['characteristics']);
});

// ---------------------------------------------------------------- Modelo: cálculo (CA1, CA3)

test('HU-009 CA1 devuelve un valor y un rango orientativos redondeados', () => {
  const result = model.estimateValue(INPUT);

  assert.ok(result.estimatedMin < result.estimatedValue);
  assert.ok(result.estimatedValue < result.estimatedMax);
  for (const value of [result.estimatedValue, result.estimatedMin, result.estimatedMax]) {
    assert.equal(value % 1000, 0);
  }
  assert.equal(result.currency, 'MXN');
  assert.equal(result.comparablesUsed, 0);
  assert.equal(result.referenceLevel, 'state');
  assert.equal(result.margin, 0.18);
});

test('HU-009 CA3 el resultado incluye los factores relevantes con su impacto', () => {
  const result = model.estimateValue(INPUT);

  assert.deepEqual(
    result.factors.map((item) => item.name),
    [
      'Ubicación',
      'Superficie del terreno',
      'Construcción',
      'Calidad de la construcción',
      'Estado y antigüedad',
      'Distribución',
      'Servicios',
      'Entorno',
      'Propiedades comparables',
    ],
  );
  for (const item of result.factors) {
    assert.ok(['positive', 'neutral', 'negative'].includes(item.impact));
    assert.ok(item.explanation.length > 0);
  }
  assert.equal(factor(result, 'Ubicación').impact, 'negative');
  assert.match(factor(result, 'Ubicación').value, /estado/);
  assert.match(factor(result, 'Ubicación').explanation, /por calibrar/);
  assert.equal(factor(result, 'Estado y antigüedad').impact, 'negative');
  assert.equal(factor(result, 'Distribución').impact, 'positive');
});

test('HU-009 punto 1 usa el precio de referencia de la zona o la referencia nacional', () => {
  const hidalgo = model.estimateValue(INPUT);
  const municipio = model.estimateValue({
    ...INPUT,
    referencePrice: { ...REFERENCE, landPriceM2: 4000, constructionPriceM2: 12000, level: 'municipality' },
  });
  const nacional = model.estimateValue({ ...INPUT, referencePrice: null });

  assert.ok(municipio.estimatedValue > hidalgo.estimatedValue);
  assert.match(factor(municipio, 'Ubicación').value, /municipio/);
  assert.equal(factor(municipio, 'Ubicación').impact, 'positive');
  assert.equal(nacional.referenceLevel, 'national');
  assert.equal(factor(nacional, 'Ubicación').impact, 'neutral');
  assert.match(factor(nacional, 'Ubicación').explanation, /referencia nacional/);
  assert.equal(nacional.margin, 0.22);
});

test('HU-009 punto 3 la calidad de la construcción cambia el costo por m²', () => {
  const values = ['economica', 'media', 'residencial', 'lujo'].map(
    (quality) =>
      model.estimateValue({
        ...INPUT,
        characteristics: { ...CHARACTERISTICS, constructionQuality: quality },
      }).estimatedValue,
  );
  assert.deepEqual([...values].sort((a, b) => a - b), values);

  const lujo = model.estimateValue({
    ...INPUT,
    characteristics: { ...CHARACTERISTICS, constructionQuality: 'lujo' },
  });
  assert.equal(factor(lujo, 'Calidad de la construcción').impact, 'positive');
  assert.equal(factor(lujo, 'Calidad de la construcción').value, 'lujo');
});

test('HU-009 punto 3 sin calidad registrada asume media, lo indica y amplía el rango', () => {
  const sinCalidad = model.estimateValue({
    ...INPUT,
    characteristics: { ...CHARACTERISTICS, constructionQuality: null },
  });
  const media = model.estimateValue(INPUT);

  assert.equal(sinCalidad.estimatedValue, media.estimatedValue);
  assert.equal(sinCalidad.margin, 0.21);
  assert.match(factor(sinCalidad, 'Calidad de la construcción').value, /Sin dato/);
  assert.match(factor(sinCalidad, 'Calidad de la construcción').explanation, /más precisa/);
});

test('HU-009 un terreno solo considera la superficie y un departamento el terreno indiviso', () => {
  const terreno = model.estimateValue({
    ...INPUT,
    propertyType: { name: 'Terreno' },
    characteristics: { landArea: 200, hasConstruction: false },
  });
  assert.equal(factor(terreno, 'Construcción'), undefined);
  assert.equal(factor(terreno, 'Calidad de la construcción'), undefined);
  assert.equal(factor(terreno, 'Distribución'), undefined);
  assert.equal(terreno.margin, 0.18);

  const casa = model.estimateValue(INPUT).estimatedValue;
  const depa = model.estimateValue({ ...INPUT, propertyType: { name: 'Departamento' } }).estimatedValue;
  assert.ok(depa < casa);
});

test('HU-009 el estado general y la antigüedad ajustan el valor de la construcción', () => {
  const nueva = model.estimateValue({
    ...INPUT,
    characteristics: { ...CHARACTERISTICS, generalCondition: 'excelente', constructionAge: 0 },
  });
  const vieja = model.estimateValue({
    ...INPUT,
    characteristics: { ...CHARACTERISTICS, generalCondition: 'malo', constructionAge: 80 },
  });

  assert.ok(nueva.estimatedValue > vieja.estimatedValue);
  assert.equal(factor(nueva, 'Estado y antigüedad').impact, 'positive');
  assert.equal(factor(vieja, 'Estado y antigüedad').impact, 'negative');
});

test('HU-009 la falta de servicios básicos reduce el valor', () => {
  const completa = model.estimateValue(INPUT);
  const sinDrenaje = model.estimateValue({
    ...INPUT,
    services: SERVICES.filter((service) => service.name !== 'Drenaje'),
  });

  assert.ok(sinDrenaje.estimatedValue < completa.estimatedValue);
  assert.equal(factor(sinDrenaje, 'Servicios').impact, 'negative');
  assert.match(factor(sinDrenaje, 'Servicios').explanation, /drenaje/);

  const sinServicios = model.estimateValue({ ...INPUT, services: [] });
  assert.equal(sinServicios.margin, 0.2);
});

test('HU-009 el entorno solo considera puntos de interés cercanos', () => {
  const result = model.estimateValue(INPUT);
  assert.equal(factor(result, 'Entorno').value, 'escuela, supermercado');

  const sinPuntos = model.estimateValue({ ...INPUT, nearbyPlaces: [] });
  assert.equal(factor(sinPuntos, 'Entorno').impact, 'neutral');
  assert.equal(sinPuntos.margin, 0.2);
});

test('HU-009 punto 2 con al menos 3 comparables cercanos el resultado se acerca al mercado', () => {
  const base = model.estimateValue(INPUT);
  const caros = [3_000_000, 3_200_000, 3_100_000].map((price) => comparable(price));
  const conComparables = model.estimateValue({ ...INPUT, comparables: caros, comparablesByRadius: true });

  assert.equal(conComparables.comparablesUsed, 3);
  assert.ok(conComparables.estimatedValue > base.estimatedValue);
  assert.equal(conComparables.margin, 0.1);
  assert.equal(factor(conComparables, 'Propiedades comparables').impact, 'positive');
  assert.match(factor(conComparables, 'Propiedades comparables').value, /a menos de 2 km/);

  const cinco = model.estimateValue({
    ...INPUT,
    comparables: [...caros, comparable(2_900_000), comparable(3_050_000)],
  });
  assert.equal(cinco.margin, 0.08);
  assert.match(factor(cinco, 'Propiedades comparables').value, /en Tula de Allende, Hidalgo/);
});

test('HU-009 punto 2 los comparables más cercanos y parecidos pesan más', () => {
  const cercanos = [comparable(3_000_000, { distanceM: 100 }), comparable(3_000_000, { distanceM: 150 })];
  const lejanoBarato = comparable(1_000_000, { distanceM: 1900 });
  const distintoBarato = comparable(1_000_000, { distanceM: 100, quality: 'economica', builtArea: 40 });

  const result = model.estimateValue({
    ...INPUT,
    comparables: [...cercanos, lejanoBarato, distintoBarato],
  });
  // La mediana ponderada queda en el precio por m² de los comparables cercanos y similares.
  assert.match(factor(result, 'Propiedades comparables').explanation, /\$25,000 por m²/);
});

test('HU-009 la mediana ponderada acumula la mitad del peso total', () => {
  assert.equal(
    model.weightedMedian([
      { value: 10, weight: 1 },
      { value: 20, weight: 5 },
      { value: 30, weight: 1 },
    ]),
    20,
  );
  assert.equal(model.weightedMedian([{ value: 5, weight: 0 }]), 5);
});

test('HU-009 los comparables incompletos se descartan', () => {
  const result = model.estimateValue({
    ...INPUT,
    comparables: [
      comparable(2_000_000, { distanceM: null }),
      comparable(null),
      { publicationPrice: 2_100_000, landArea: 0, hasConstruction: true, builtArea: 0 },
      { publicationPrice: 900_000, landArea: 0, hasConstruction: false, builtArea: null },
    ],
  });

  assert.equal(result.comparablesUsed, 0);
  assert.match(factor(result, 'Propiedades comparables').value, /^1 disponible /);
});

test('HU-009 RN1 la explicación local aclara que no es un avalúo profesional', () => {
  const result = model.estimateValue(INPUT);
  const text = model.buildExplanation({ ...INPUT, result });

  assert.match(text, /Tula de Allende, Hidalgo/);
  assert.match(text, /No sustituye un avalúo profesional/);
  assert.match(model.DISCLAIMER, /No es un avalúo oficial/);
  assert.equal(model.normalize('  Ciudad de MÉXICO '), 'ciudad de mexico');
  assert.match(model.buildExplanation({ ...INPUT, result: { ...result, factors: [] } }), /la superficie y la ubicación/);
});

// ---------------------------------------------------------------- IA opcional

const AI_ENV = { ESTIMATION_AI_API_KEY: 'clave-de-prueba' };
const okResponse = (body) => ({ ok: true, json: async () => body });

test('HU-009 sin API key no se llama a la IA', async () => {
  let called = false;
  const result = await aiExplainer.explainWithAi({}, {
    env: {},
    fetchImpl: async () => {
      called = true;
    },
  });

  assert.equal(result, null);
  assert.equal(called, false);
});

test('HU-009 con API key la IA redacta la explicación sin recibir datos personales', async () => {
  let request;
  const summary = { municipality: 'Tula de Allende', estimatedValue: 1_250_000 };
  const result = await aiExplainer.explainWithAi(summary, {
    env: AI_ENV,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return okResponse({ content: [{ type: 'text', text: '  Explicación generada.  ' }] });
    },
  });

  assert.deepEqual(result, { text: 'Explicación generada.', model: aiExplainer.DEFAULT_MODEL });
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.options.headers['x-api-key'], 'clave-de-prueba');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(JSON.parse(body.messages[0].content), summary);
  assert.match(body.system, /No cambies ni inventes cifras/);
});

test('HU-009 la configuración de la IA acepta modelo y tiempo límite propios', () => {
  assert.deepEqual(
    aiExplainer.getConfig({ ...AI_ENV, ESTIMATION_AI_MODEL: 'otro-modelo', ESTIMATION_AI_TIMEOUT_MS: '2000' }),
    { apiKey: 'clave-de-prueba', model: 'otro-modelo', timeoutMs: 2000 },
  );
  assert.equal(aiExplainer.getConfig({ ...AI_ENV, ESTIMATION_AI_TIMEOUT_MS: 'x' }).timeoutMs, 8000);
});

test('HU-009 si la IA falla, responde vacío o tarda, se usa la explicación local', async () => {
  const cases = [
    async () => ({ ok: false, json: async () => ({}) }),
    async () => {
      throw new Error('sin conexión');
    },
    async () => okResponse({ content: [] }),
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('timeout')));
      }),
  ];

  for (const fetchImpl of cases) {
    const result = await aiExplainer.explainWithAi({}, {
      env: { ...AI_ENV, ESTIMATION_AI_TIMEOUT_MS: '20' },
      fetchImpl,
    });
    assert.equal(result, null);
  }
});

test('HU-009 la explicación de la IA se recorta a 1500 caracteres', async () => {
  const result = await aiExplainer.explainWithAi({}, {
    env: AI_ENV,
    fetchImpl: async () => okResponse({ content: [{ type: 'text', text: 'a'.repeat(2000) }] }),
  });
  assert.equal(result.text.length, 1500);
});

// ---------------------------------------------------------------- Repositorio

const ESTIMATION_ROW = {
  id: '15',
  property_id: '7',
  requested_by: OWNER_ID,
  estimated_value: '1258000.00',
  estimated_min: '1031000.00',
  estimated_max: '1484000.00',
  explanation: 'Explicación',
  model_name: 'terravalle-valuador',
  model_version: '1.0.0',
  created_at: '2026-10-28T12:00:00.000Z',
  factors: [{ name: 'Ubicación', value: 'Tula', impact: 'negative', explanation: 'x' }],
};

function mockQuery(t, rows) {
  return t.mock.method(database, 'query', async () => ({ rows }));
}

test('HU-009 punto 1 el repositorio busca el precio de referencia más específico de la zona', async (t) => {
  const query = mockQuery(t, [
    {
      land_price_m2: '4000.00',
      construction_price_m2: '11000.00',
      source: 'Tabla de valores 2026',
      valid_from: '2026-01-01',
      level: 'municipality',
    },
  ]);

  const reference = await estimationRepository.findReferencePrice({
    state: 'Hidalgo',
    municipality: 'Tula de Allende',
    postalCode: '42800',
  });

  assert.deepEqual(reference, {
    landPriceM2: 4000,
    constructionPriceM2: 11000,
    level: 'municipality',
    source: 'Tabla de valores 2026',
    validFrom: '2026-01-01',
  });
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /FROM reference_prices/);
  assert.match(sql, /ORDER BY \(postal_code IS NOT NULL\) DESC, \(municipality IS NOT NULL\) DESC/);
  assert.deepEqual(params, ['Hidalgo', 'Tula de Allende', '42800']);
});

test('HU-009 punto 1 sin precio de referencia de la zona devuelve null', async (t) => {
  const query = mockQuery(t, []);
  assert.equal(await estimationRepository.findReferencePrice({ state: 'Sonora', municipality: 'X' }), null);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['Sonora', 'X', null]);
});

test('HU-009 punto 2 con coordenadas busca comparables dentro del radio', async (t) => {
  const query = mockQuery(t, [
    {
      publication_price: '2000000.00',
      land_area_m2: '150.00',
      has_construction: true,
      built_area_m2: '110.00',
      construction_quality: 'media',
      distance_m: '350.5',
    },
  ]);

  const result = await estimationRepository.findComparables({
    propertyId: '7',
    propertyTypeId: 2,
    municipality: 'Tula de Allende',
    state: 'Hidalgo',
    latitude: 20.053,
    longitude: -99.343,
  });

  assert.deepEqual(result, [
    {
      publicationPrice: 2000000,
      landArea: 150,
      hasConstruction: true,
      builtArea: 110,
      constructionQuality: 'media',
      distanceM: 350.5,
    },
  ]);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /6371000 \* 2 \* asin/);
  assert.match(sql, /distance_m <= \$5/);
  assert.match(sql, /p\.status = 'active'/);
  assert.deepEqual(params, ['7', 2, 20.053, -99.343, 2000, 30]);
});

test('HU-009 punto 2 sin coordenadas busca comparables del mismo municipio y estado', async (t) => {
  const query = mockQuery(t, [
    {
      publication_price: '1800000.00',
      land_area_m2: '140.00',
      has_construction: false,
      built_area_m2: null,
      construction_quality: null,
      distance_m: null,
    },
  ]);

  const [item] = await estimationRepository.findComparables({
    propertyId: '7',
    propertyTypeId: 2,
    municipality: 'Tula de Allende',
    state: 'Hidalgo',
  });

  assert.equal(item.distanceM, null);
  assert.equal(item.constructionQuality, null);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /translate\(lower\(trim\(pl\.municipality\)\)/);
  assert.deepEqual(params, ['7', 2, 'Tula de Allende', 'Hidalgo', 30]);
});

test('HU-009 RN4 el repositorio guarda la estimación con fecha, versión y factores en una sentencia', async (t) => {
  const query = mockQuery(t, [{ ...ESTIMATION_ROW, factors: JSON.stringify(ESTIMATION_ROW.factors) }]);

  const saved = await estimationRepository.createEstimation({
    propertyId: '7',
    requestedBy: OWNER_ID,
    estimatedValue: 1258000,
    estimatedMin: 1031000,
    estimatedMax: 1484000,
    explanation: 'Explicación',
    modelName: 'terravalle-valuador',
    modelVersion: '1.0.0',
    factors: [{ name: 'Ubicación', value: 'x'.repeat(300), impact: 'negative', explanation: 'y' }],
  });

  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO ai_estimations/);
  assert.match(sql, /INSERT INTO ai_estimation_factors/);
  assert.equal(params[7], '1.0.0');
  assert.deepEqual(params[8], ['Ubicación']);
  assert.equal(params[9][0].length, 255);
  assert.deepEqual(saved, {
    id: '15',
    propertyId: '7',
    requestedBy: OWNER_ID,
    estimatedValue: 1258000,
    estimatedMin: 1031000,
    estimatedMax: 1484000,
    explanation: 'Explicación',
    modelName: 'terravalle-valuador',
    modelVersion: '1.0.0',
    createdAt: ESTIMATION_ROW.created_at,
    factors: ESTIMATION_ROW.factors,
  });
});

test('HU-009 el repositorio consulta el historial de la propiedad, la más reciente primero', async (t) => {
  const query = mockQuery(t, [{ ...ESTIMATION_ROW, estimated_value: null }]);

  const [estimation] = await estimationRepository.findEstimationsByPropertyId('7');

  assert.equal(estimation.estimatedValue, null);
  assert.equal(estimation.factors.length, 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /ORDER BY e\.created_at DESC/);
  assert.deepEqual(params, ['7', 10]);
});

// ---------------------------------------------------------------- Servicio

function mockPropertyData(t, overrides = {}) {
  const data = {
    propertyType: CASA,
    characteristics: CHARACTERISTICS,
    location: LOCATION,
    services: SERVICES,
    nearbyPlaces: NEARBY,
    comparables: [],
    referencePrice: REFERENCE,
    ...overrides,
  };
  t.mock.method(estimationRepository, 'findReferencePrice', async () => data.referencePrice);
  t.mock.method(propertyRepository, 'findPropertyTypeById', async () => data.propertyType);
  t.mock.method(propertyRepository, 'findCharacteristicsByPropertyId', async () => data.characteristics);
  t.mock.method(propertyRepository, 'findLocationByPropertyId', async () => data.location);
  t.mock.method(propertyRepository, 'findNearbyPlacesByPropertyId', async () => data.nearbyPlaces);
  t.mock.method(serviceRepository, 'findServicesByPropertyId', async () => data.services);
  const comparables = t.mock.method(estimationRepository, 'findComparables', async () => data.comparables);
  const save = t.mock.method(estimationRepository, 'createEstimation', async (record) => ({
    id: '15',
    propertyId: record.propertyId,
    requestedBy: record.requestedBy,
    estimatedValue: record.estimatedValue,
    estimatedMin: record.estimatedMin,
    estimatedMax: record.estimatedMax,
    explanation: record.explanation,
    modelName: record.modelName,
    modelVersion: record.modelVersion,
    createdAt: '2026-10-28T12:00:00.000Z',
    factors: record.factors,
  }));
  const updatePrice = t.mock.method(propertyRepository, 'updateProperty', async () => null);
  return { comparables, save, updatePrice };
}

test('HU-009 CA2 el servicio no calcula ni guarda si faltan datos', async (t) => {
  const { comparables, save } = mockPropertyData(t, { location: null });

  const result = await estimationService.requestEstimation({ property: PROPERTY, userId: OWNER_ID });

  assert.deepEqual(result.missing.map((item) => item.field), ['location']);
  assert.equal(comparables.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
});

test('HU-009 CA1 RN4 el servicio guarda la estimación con la versión del modelo local', async (t) => {
  const { save, comparables } = mockPropertyData(t);
  t.mock.method(aiExplainer, 'explainWithAi', async () => null);

  const { estimation } = await estimationService.requestEstimation({ property: PROPERTY, userId: OWNER_ID });

  assert.deepEqual(comparables.mock.calls[0].arguments[0], {
    propertyId: '7',
    propertyTypeId: 2,
    municipality: 'Tula de Allende',
    state: 'Hidalgo',
    latitude: 20.053,
    longitude: -99.343,
    radiusM: 2000,
  });
  const record = save.mock.calls[0].arguments[0];
  assert.equal(record.modelName, 'terravalle-valuador');
  assert.equal(record.modelVersion, '1.1.0');
  assert.equal(record.requestedBy, OWNER_ID);
  assert.match(record.explanation, /No sustituye un avalúo profesional/);
  assert.equal(estimation.isOfficialAppraisal, false);
  assert.equal(estimation.disclaimer, model.DISCLAIMER);
  assert.equal(estimation.currency, 'MXN');
});

test('HU-009 con IA configurada se guarda su explicación y el modelo usado', async (t) => {
  const { save } = mockPropertyData(t);
  const ai = t.mock.method(aiExplainer, 'explainWithAi', async () => ({
    text: 'Explicación de la IA.',
    model: 'claude-haiku-4-5-20251001',
  }));

  await estimationService.requestEstimation({ property: PROPERTY, userId: OWNER_ID });

  const summary = ai.mock.calls[0].arguments[0];
  assert.equal(summary.ownerId, undefined);
  assert.equal(summary.municipality, 'Tula de Allende');
  const record = save.mock.calls[0].arguments[0];
  assert.equal(record.explanation, 'Explicación de la IA.');
  assert.equal(record.modelVersion, '1.1.0+ai:claude-haiku-4-5-20251001');
});

test('HU-009 punto 2 sin coordenadas el servicio busca comparables por municipio', async (t) => {
  const { comparables } = mockPropertyData(t, {
    location: { municipality: 'Tula de Allende', state: 'Hidalgo', latitude: null, longitude: null },
  });
  t.mock.method(aiExplainer, 'explainWithAi', async () => null);

  await estimationService.requestEstimation({ property: PROPERTY, userId: OWNER_ID });

  const args = comparables.mock.calls[0].arguments[0];
  assert.equal(args.latitude, null);
  assert.equal(args.longitude, null);
});

test('HU-009 CA4 RN2 estimar no modifica el precio de publicación', async (t) => {
  const { updatePrice } = mockPropertyData(t);
  t.mock.method(aiExplainer, 'explainWithAi', async () => null);

  await estimationService.requestEstimation({ property: PROPERTY, userId: OWNER_ID });

  assert.equal(updatePrice.mock.callCount(), 0);
});

// ---------------------------------------------------------------- Controlador

function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

const mockReq = ({ id = '7', userId = OWNER_ID } = {}) => ({ params: { id }, auth: { userId } });

function mockProperty(t, property = PROPERTY) {
  t.mock.method(propertyRepository, 'findPropertyById', async (id) =>
    property && id === property.id ? property : null,
  );
}

test('HU-009 CA1 CA3 CA4 el dueño solicita una estimación y recibe 201', async (t) => {
  mockProperty(t);
  mockPropertyData(t);
  t.mock.method(aiExplainer, 'explainWithAi', async () => null);
  const res = mockRes();

  await requestEstimation(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.estimation.isOfficialAppraisal, false);
  assert.match(res.body.estimation.disclaimer, /No es un avalúo oficial/);
  assert.ok(res.body.estimation.factors.length >= 5);
  assert.equal(res.body.publicationPrice, 1500000);
  assert.match(res.body.note, /precio final distinto/);
});

test('HU-009 CA2 si faltan datos responde 422 con lo que debe completar', async (t) => {
  mockProperty(t);
  mockPropertyData(t, { characteristics: null });
  const res = mockRes();

  await requestEstimation(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.message, 'Faltan datos de la propiedad para estimar su valor.');
  assert.deepEqual(res.body.missing.map((item) => item.section), ['Dimensiones y construcción']);
});

test('HU-009 una propiedad retirada no se puede estimar (409)', async (t) => {
  mockProperty(t, { ...PROPERTY, status: 'withdrawn' });
  const service = t.mock.method(estimationService, 'requestEstimation');
  const res = mockRes();

  await requestEstimation(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 409);
  assert.equal(service.mock.callCount(), 0);
});

test('HU-009 estimar una propiedad ajena devuelve 403 y una inexistente 404', async (t) => {
  mockProperty(t);

  const ajena = mockRes();
  await requestEstimation(mockReq({ userId: '999' }), ajena, assert.fail);
  assert.equal(ajena.statusCode, 403);
  assert.equal(ajena.body.message, 'No tienes permiso para estimar el valor de esta propiedad.');

  const inexistente = mockRes();
  await requestEstimation(mockReq({ id: '8' }), inexistente, assert.fail);
  assert.equal(inexistente.statusCode, 404);
});

test('HU-009 el dueño consulta el historial de estimaciones con la advertencia', async (t) => {
  mockProperty(t);
  t.mock.method(estimationRepository, 'findEstimationsByPropertyId', async () => [
    { id: '15', propertyId: '7', factors: [] },
  ]);
  const res = mockRes();

  await listEstimations(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.estimations[0].disclaimer, model.DISCLAIMER);
  assert.equal(res.body.disclaimer, model.DISCLAIMER);

  const ajena = mockRes();
  await listEstimations(mockReq({ userId: '999' }), ajena, assert.fail);
  assert.equal(ajena.statusCode, 403);
  assert.equal(ajena.body.message, 'No tienes permiso para consultar esta propiedad.');
});

test('HU-009 un error de base de datos se delega al manejador global', async (t) => {
  const failure = new Error('fallo');
  t.mock.method(propertyRepository, 'findPropertyById', async () => {
    throw failure;
  });

  for (const handler of [requestEstimation, listEstimations]) {
    let received;
    await handler(mockReq(), mockRes(), (error) => {
      received = error;
    });
    assert.equal(received, failure);
  }
});

test('HU-009 las rutas de estimación exigen sesión', async () => {
  const { app } = require('../src/server');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/properties/7/estimations`;

  try {
    const post = await fetch(base, { method: 'POST' });
    const get = await fetch(base);
    assert.equal(post.status, 401);
    assert.equal(get.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
