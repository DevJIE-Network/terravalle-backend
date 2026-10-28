const assert = require('node:assert/strict');
const { test } = require('node:test');
const propertyRepository = require('../src/repositories/property.repository');
const {
  getCharacteristics,
  saveCharacteristics,
} = require('../src/controllers/property.controller');
const {
  saveCharacteristicsSchema,
  toCharacteristicsRecord,
} = require('../src/schemas/property-characteristics.schema');

const OWNER_ID = '101';
const PROPERTY = { id: '7', ownerId: OWNER_ID, title: 'Casa en Tula' };

const LAND_ONLY = { landArea: 200, frontage: 10, depth: 20, hasConstruction: false };
const WITH_CONSTRUCTION = {
  landArea: 200,
  frontage: 10,
  depth: 20,
  hasConstruction: true,
  builtArea: 150,
  bedrooms: 3,
  bathrooms: 2,
  floors: 2,
  parkingSpaces: 1,
  constructionAge: 5,
  generalCondition: 'bueno',
  constructionQuality: 'media',
};

const parse = (body) => saveCharacteristicsSchema.safeParse(body);
const fieldsWithError = (result) => result.error.issues.map((issue) => issue.path.join('.'));

// Respuesta y solicitud mínimas para probar los controladores sin levantar el servidor.
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

function mockReq({ body, id = '7', userId = OWNER_ID } = {}) {
  return { params: { id }, body, auth: { userId } };
}

function mockProperty(t, property = PROPERTY) {
  t.mock.method(propertyRepository, 'findPropertyById', async (id) => (
    property && id === property.id ? property : null
  ));
}

// ---------------------------------------------------------------- Esquema

test('HU-005 CA1 acepta dimensiones válidas del terreno', () => {
  const result = parse(LAND_ONLY);
  assert.equal(result.success, true);
});

test('HU-005 CA1 acepta medidas como texto numérico (formularios)', () => {
  const result = parse({ landArea: '250.50', frontage: '10', depth: '25', hasConstruction: 'false' });
  assert.equal(result.success, true);
  assert.deepEqual(toCharacteristicsRecord(result.data).landArea, 250.5);
});

test('HU-005 CA1 el frente y el fondo son opcionales', () => {
  assert.equal(parse({ landArea: 120, hasConstruction: false }).success, true);
});

test('HU-005 CA2 sin construcción no exige campos de edificación', () => {
  const result = parse(LAND_ONLY);
  assert.equal(result.success, true);

  const record = toCharacteristicsRecord(result.data);
  assert.equal(record.hasConstruction, false);
  assert.equal(record.builtArea, null);
  assert.equal(record.bedrooms, null);
  assert.equal(record.bathrooms, null);
  assert.equal(record.floors, null);
  assert.equal(record.parkingSpaces, null);
  assert.equal(record.constructionAge, null);
  assert.equal(record.generalCondition, null);
});

test('HU-005 CA2 sin construcción rechaza datos de edificación enviados', () => {
  const result = parse({ ...LAND_ONLY, builtArea: 100, bedrooms: 2 });
  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result).sort(), ['bedrooms', 'builtArea']);
});

test('HU-005 CA2 los campos de construcción vacíos o nulos se tratan como ausentes', () => {
  const result = parse({ ...LAND_ONLY, builtArea: '', bedrooms: null, generalCondition: '' });
  assert.equal(result.success, true);
});

test('HU-005 CA3 con construcción acepta los datos completos y los conserva', () => {
  const result = parse(WITH_CONSTRUCTION);
  assert.equal(result.success, true);
  assert.deepEqual(toCharacteristicsRecord(result.data), WITH_CONSTRUCTION);
});

test('HU-005 la calidad de la construcción es opcional y se valida contra el catálogo', () => {
  const { constructionQuality, ...withoutQuality } = WITH_CONSTRUCTION;
  assert.equal(constructionQuality, 'media');

  const sinCalidad = parse(withoutQuality);
  assert.equal(sinCalidad.success, true);
  assert.equal(toCharacteristicsRecord(sinCalidad.data).constructionQuality, null);

  for (const quality of ['economica', 'media', 'residencial', 'lujo']) {
    const result = parse({ ...WITH_CONSTRUCTION, constructionQuality: quality });
    assert.equal(toCharacteristicsRecord(result.data).constructionQuality, quality);
  }

  const invalida = parse({ ...WITH_CONSTRUCTION, constructionQuality: 'premium' });
  assert.deepEqual(fieldsWithError(invalida), ['constructionQuality']);

  const sinConstruccion = parse({ ...LAND_ONLY, constructionQuality: 'media' });
  assert.deepEqual(fieldsWithError(sinConstruccion), ['constructionQuality']);
});

test('HU-005 CA3 con construcción exige los datos obligatorios', () => {
  const result = parse({ landArea: 200, hasConstruction: true });
  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result).sort(), [
    'bathrooms',
    'bedrooms',
    'builtArea',
    'constructionAge',
    'floors',
    'generalCondition',
  ]);
});

test('HU-005 CA3 el estacionamiento es opcional y por omisión se guarda en 0', () => {
  const { parkingSpaces: _omit, ...withoutParking } = WITH_CONSTRUCTION;
  const result = parse(withoutParking);
  assert.equal(result.success, true);
  assert.equal(toCharacteristicsRecord(result.data).parkingSpaces, 0);
});

test('HU-005 CA3 acepta cero habitaciones, baños, estacionamientos y antigüedad', () => {
  const result = parse({
    ...WITH_CONSTRUCTION,
    bedrooms: 0,
    bathrooms: 0,
    parkingSpaces: 0,
    constructionAge: 0,
  });
  assert.equal(result.success, true);
});

test('HU-005 CA4 rechaza superficies y medidas negativas o en cero', () => {
  const negative = parse({ landArea: -50, frontage: -1, depth: 0, hasConstruction: false });
  assert.equal(negative.success, false);
  assert.deepEqual(fieldsWithError(negative).sort(), ['depth', 'frontage', 'landArea']);

  const zeroBuilt = parse({ ...WITH_CONSTRUCTION, builtArea: 0 });
  assert.equal(zeroBuilt.success, false);
  assert.deepEqual(fieldsWithError(zeroBuilt), ['builtArea']);
});

test('HU-005 CA4 rechaza habitaciones, baños, estacionamientos y antigüedad negativos', () => {
  const result = parse({
    ...WITH_CONSTRUCTION,
    bedrooms: -1,
    bathrooms: -2,
    parkingSpaces: -1,
    constructionAge: -3,
  });
  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result).sort(), [
    'bathrooms',
    'bedrooms',
    'constructionAge',
    'parkingSpaces',
  ]);
});

test('HU-005 CA3 acepta medios baños y rechaza otras fracciones', () => {
  assert.equal(parse({ ...WITH_CONSTRUCTION, bathrooms: 1.5 }).success, true);

  const result = parse({ ...WITH_CONSTRUCTION, bathrooms: 1.3 });
  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result), ['bathrooms']);
});

test('HU-005 CA4 rechaza cero pisos y valores no enteros', () => {
  const zeroFloors = parse({ ...WITH_CONSTRUCTION, floors: 0 });
  assert.equal(zeroFloors.success, false);
  assert.deepEqual(fieldsWithError(zeroFloors), ['floors']);

  const decimals = parse({ ...WITH_CONSTRUCTION, bedrooms: 2.5 });
  assert.equal(decimals.success, false);
  assert.deepEqual(fieldsWithError(decimals), ['bedrooms']);
});

test('HU-005 CA4 rechaza texto, NaN y valores fuera de rango', () => {
  assert.equal(parse({ landArea: 'abc', hasConstruction: false }).success, false);
  assert.equal(parse({ landArea: 100, hasConstruction: 'tal vez' }).success, false);
  assert.equal(parse({ landArea: 100.123, hasConstruction: false }).success, false);
  assert.equal(parse({ landArea: 99_999_999, hasConstruction: false }).success, false);
  assert.equal(parse({ ...WITH_CONSTRUCTION, constructionAge: 500 }).success, false);
  assert.equal(parse({ ...WITH_CONSTRUCTION, generalCondition: 'excelentísimo' }).success, false);
});

test('HU-005 CA4 rechaza datos incoherentes entre sí', () => {
  // Superficie del terreno mayor que frente × fondo (10 × 10 = 100 m²).
  const bigLand = parse({ landArea: 500, frontage: 10, depth: 10, hasConstruction: false });
  assert.equal(bigLand.success, false);
  assert.deepEqual(fieldsWithError(bigLand), ['landArea']);

  // Terreno irregular: menor que frente × fondo es válido.
  assert.equal(parse({ landArea: 60, frontage: 10, depth: 10, hasConstruction: false }).success, true);

  // Construido (500) mayor que terreno (200) × pisos (2).
  const bigBuilt = parse({ ...WITH_CONSTRUCTION, builtArea: 500 });
  assert.equal(bigBuilt.success, false);
  assert.deepEqual(fieldsWithError(bigBuilt), ['builtArea']);
});

test('HU-005 exige superficie del terreno y la indicación de construcción', () => {
  const result = parse({});
  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result).sort(), ['hasConstruction', 'landArea']);
});

test('HU-005 rechaza campos desconocidos y cuerpos que no son objeto', () => {
  assert.equal(parse({ ...LAND_ONLY, ownerId: '1' }).success, false);
  assert.equal(parse(undefined).success, false);
  assert.equal(parse('texto').success, false);
});

// ------------------------------------------------------------ Controlador

test('HU-005 CA1 el dueño guarda las medidas y se asocian a su propiedad', async (t) => {
  mockProperty(t);
  const upsert = t.mock.method(propertyRepository, 'upsertCharacteristics', async (propertyId, data) => ({
    propertyId,
    ...data,
  }));
  const res = mockRes();
  const next = t.mock.fn();

  await saveCharacteristics(mockReq({ body: LAND_ONLY }), res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.characteristics.propertyId, '7');
  assert.equal(res.body.characteristics.landArea, 200);
  assert.equal(upsert.mock.callCount(), 1);
  assert.equal(upsert.mock.calls[0].arguments[0], '7');
  assert.equal(next.mock.callCount(), 0);
});

test('HU-005 CA3 el dueño guarda las características de construcción', async (t) => {
  mockProperty(t);
  const upsert = t.mock.method(propertyRepository, 'upsertCharacteristics', async (propertyId, data) => ({
    propertyId,
    ...data,
  }));
  const res = mockRes();

  await saveCharacteristics(mockReq({ body: WITH_CONSTRUCTION }), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.deepEqual(upsert.mock.calls[0].arguments[1], WITH_CONSTRUCTION);
  assert.equal(res.body.characteristics.generalCondition, 'bueno');
});

test('HU-005 CA4 los datos inválidos devuelven 400 con el detalle y no se guardan', async (t) => {
  mockProperty(t);
  const upsert = t.mock.method(propertyRepository, 'upsertCharacteristics', async () => ({}));
  const res = mockRes();

  await saveCharacteristics(
    mockReq({ body: { landArea: -10, hasConstruction: true, bedrooms: -1 } }),
    res,
    () => {},
  );

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.some((error) => error.field === 'landArea'));
  assert.ok(res.body.errors.some((error) => error.field === 'bedrooms'));
  assert.equal(upsert.mock.callCount(), 0);
});

test('HU-005 una propiedad inexistente devuelve 404', async (t) => {
  mockProperty(t, null);
  const upsert = t.mock.method(propertyRepository, 'upsertCharacteristics', async () => ({}));
  const res = mockRes();

  await saveCharacteristics(mockReq({ body: LAND_ONLY, id: '999' }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(upsert.mock.callCount(), 0);
});

test('HU-005 una propiedad de otro vendedor devuelve 403 y no se modifica', async (t) => {
  mockProperty(t, { ...PROPERTY, ownerId: '202' });
  const upsert = t.mock.method(propertyRepository, 'upsertCharacteristics', async () => ({}));
  const res = mockRes();

  await saveCharacteristics(mockReq({ body: LAND_ONLY }), res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(upsert.mock.callCount(), 0);
});

test('HU-005 un error de base de datos se delega al manejador global', async (t) => {
  mockProperty(t);
  const failure = new Error('fallo de base de datos');
  t.mock.method(propertyRepository, 'upsertCharacteristics', async () => {
    throw failure;
  });
  const next = t.mock.fn();

  await saveCharacteristics(mockReq({ body: LAND_ONLY }), mockRes(), next);

  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0].arguments[0], failure);
});

test('HU-005 el dueño consulta sus características y recibe null si aún no existen', async (t) => {
  mockProperty(t);
  const saved = { propertyId: '7', landArea: 200, hasConstruction: false };
  t.mock.method(propertyRepository, 'findCharacteristicsByPropertyId', async () => saved);

  const found = mockRes();
  await getCharacteristics(mockReq(), found, () => {});
  assert.equal(found.statusCode, 200);
  assert.deepEqual(found.body.characteristics, saved);

  t.mock.method(propertyRepository, 'findCharacteristicsByPropertyId', async () => null);
  const empty = mockRes();
  await getCharacteristics(mockReq(), empty, () => {});
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.body.characteristics, null);
});

test('HU-005 consultar características de otro vendedor devuelve 403', async (t) => {
  mockProperty(t, { ...PROPERTY, ownerId: '202' });
  const res = mockRes();

  await getCharacteristics(mockReq(), res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'No tienes permiso para consultar esta propiedad.');
});
