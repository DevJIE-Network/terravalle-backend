const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const database = require('../src/config/database');
const repository = require('../src/repositories/property-detail.repository');
const {
  NOT_FOUND_MESSAGE,
  UNAVAILABLE_MESSAGE,
  NOTES,
} = require('../src/controllers/property-detail.controller');
const { app } = require('../src/server');

// Fila base tal como la devuelve PostgreSQL (NUMERIC y BIGINT llegan como texto).
const ROW = {
  id: '7',
  title: 'Casa en Tula',
  description: 'Casa de dos plantas cerca del centro.',
  publication_price: '1500000.00',
  status: 'active',
  published_at: '2026-11-01T18:00:00.000Z',
  updated_at: '2026-11-05T18:00:00.000Z',
  property_type_id: '2',
  property_type_name: 'Casa',
  features_property_id: '7',
  land_area_m2: '200.50',
  frontage_m: '10.00',
  depth_m: '20.05',
  has_construction: true,
  built_area_m2: '150.00',
  bedrooms: 3,
  bathrooms: '2.5',
  floors: 2,
  parking_spaces: 1,
  age_years: 5,
  general_condition: 'bueno',
  construction_quality: 'media',
  location_id: '4',
  street: 'Av. Juárez',
  exterior_number: '120',
  interior_number: 'B',
  neighborhood: 'Centro',
  municipality: 'Tula de Allende',
  state: 'Hidalgo',
  postal_code: '42800',
  country: 'México',
  latitude: '20.0546000',
  longitude: '-99.3417000',
  formatted_address: 'Av. Juárez 120, Centro, Tula de Allende, Hidalgo',
  owner_id: '99',
};

const PHOTO_ROWS = [
  { id: '11', image_url: '/uploads/properties/fachada.jpg', is_primary: true },
  { id: '12', image_url: '/uploads/properties/sala.jpg', is_primary: false },
];
const SERVICE_ROWS = [
  { id: 1, name: 'Agua potable', description: null },
  { id: 2, name: 'Electricidad', description: 'Red de CFE' },
];
const NEARBY_ROWS = [
  {
    id: '30',
    name: 'Escuela Primaria Benito Juárez',
    approximate_distance_m: '350',
    provider: 'manual',
    category_id: 1,
    category_name: 'Escuela',
  },
  {
    id: '31',
    name: 'Parque Central',
    approximate_distance_m: null,
    provider: null,
    category_id: 5,
    category_name: 'Parque',
  },
];
const ESTIMATION_ROW = {
  estimated_value: '1450000.00',
  estimated_min: '1300000.00',
  estimated_max: '1600000.00',
  created_at: '2026-11-04T18:00:00.000Z',
};

const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();

/**
 * Simula database.query respondiendo según la tabla consultada, para no depender del
 * orden en que Promise.all dispara las consultas.
 */
function mockDatabase(t, overrides = {}) {
  const results = {
    base: [ROW],
    photos: PHOTO_ROWS,
    services: SERVICE_ROWS,
    nearby: NEARBY_ROWS,
    estimation: [ESTIMATION_ROW],
    ...overrides,
  };

  return t.mock.method(database, 'query', async (sql) => {
    const text = normalize(sql);
    if (text.includes('FROM properties p')) return { rows: results.base };
    if (text.includes('FROM property_photos')) return { rows: results.photos };
    if (text.includes('FROM property_services')) return { rows: results.services };
    if (text.includes('FROM nearby_places')) return { rows: results.nearby };
    if (text.includes('FROM ai_estimations')) return { rows: results.estimation };
    throw new Error(`Consulta inesperada: ${text}`);
  });
}

let baseUrl;
let server;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (!server) return;
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

const request = (id) => fetch(`${baseUrl}/api/properties/${id}`);

// ---------------------------------------------------------------- CA1 · ficha completa

test('HU-012 CA1 una propiedad activa responde 200 con la ficha completa sin sesión', async (t) => {
  mockDatabase(t);

  const response = await request('7');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.notes, NOTES);

  const { property } = body;
  assert.equal(property.id, '7');
  assert.equal(property.title, 'Casa en Tula');
  assert.equal(property.description, 'Casa de dos plantas cerca del centro.');
  assert.deepEqual(property.propertyType, { id: 2, name: 'Casa' });
  assert.equal(property.publicationPrice, 1500000);
  assert.equal(property.publishedAt, '2026-11-01T18:00:00.000Z');
  assert.deepEqual(property.photos, [
    { id: '11', imageUrl: '/uploads/properties/fachada.jpg', isPrimary: true },
    { id: '12', imageUrl: '/uploads/properties/sala.jpg', isPrimary: false },
  ]);
});

test('HU-012 la ficha no expone datos privados ni internos', async (t) => {
  mockDatabase(t);

  const { property } = await (await request('7')).json();
  const json = JSON.stringify(property);

  for (const field of ['ownerId', 'owner_id', 'storageKey', 'interiorNumber', 'status', 'deletedAt']) {
    assert.equal(json.includes(`"${field}"`), false, `No debe exponer ${field}`);
  }
  assert.equal(property.location.interiorNumber, undefined);
});

// ---------------------------------------------------------------- CA2 · dimensiones, construcción, servicios

test('HU-012 CA2 presenta dimensiones, construcción y servicios organizados', async (t) => {
  mockDatabase(t);

  const { property } = await (await request('7')).json();

  assert.deepEqual(property.dimensions, { landArea: 200.5, frontage: 10, depth: 20.05 });
  assert.equal(property.hasConstruction, true);
  assert.deepEqual(property.construction, {
    builtArea: 150,
    floors: 2,
    bedrooms: 3,
    bathrooms: 2.5,
    parkingSpaces: 1,
    constructionAge: 5,
    generalCondition: 'bueno',
    constructionQuality: 'media',
  });
  assert.deepEqual(property.services, [
    { id: 1, name: 'Agua potable', description: null },
    { id: 2, name: 'Electricidad', description: 'Red de CFE' },
  ]);
});

test('HU-012 CA2 un terreno sin construcción devuelve construction null', async (t) => {
  mockDatabase(t, {
    base: [{ ...ROW, has_construction: false, built_area_m2: null, bedrooms: null }],
  });

  const { property } = await (await request('7')).json();

  assert.equal(property.hasConstruction, false);
  assert.equal(property.construction, null);
  assert.equal(property.dimensions.landArea, 200.5);
});

test('HU-012 secciones sin capturar llegan vacías sin romper la ficha', async (t) => {
  mockDatabase(t, {
    base: [{
      ...ROW,
      features_property_id: null,
      has_construction: null,
      location_id: null,
    }],
    photos: [],
    services: [],
    nearby: [],
    estimation: [],
  });

  const response = await request('7');
  const { property } = await response.json();

  assert.equal(response.status, 200);
  assert.equal(property.dimensions, null);
  assert.equal(property.hasConstruction, false);
  assert.equal(property.construction, null);
  assert.equal(property.location, null);
  assert.deepEqual(property.photos, []);
  assert.deepEqual(property.services, []);
  assert.deepEqual(property.nearbyPlaces, []);
  assert.equal(property.estimate, null);
});

// ---------------------------------------------------------------- CA3 · ubicación y entorno

test('HU-012 CA3 muestra la ubicación y los puntos cercanos con distancias aproximadas', async (t) => {
  mockDatabase(t);

  const { property, notes } = await (await request('7')).json();

  assert.deepEqual(property.location, {
    street: 'Av. Juárez',
    exteriorNumber: '120',
    neighborhood: 'Centro',
    municipality: 'Tula de Allende',
    state: 'Hidalgo',
    postalCode: '42800',
    country: 'México',
    latitude: 20.0546,
    longitude: -99.3417,
    formattedAddress: 'Av. Juárez 120, Centro, Tula de Allende, Hidalgo',
  });
  assert.deepEqual(property.nearbyPlaces, [
    {
      id: '30',
      name: 'Escuela Primaria Benito Juárez',
      category: { id: 1, name: 'Escuela' },
      approximateDistanceM: 350,
      provider: 'manual',
    },
    {
      id: '31',
      name: 'Parque Central',
      category: { id: 5, name: 'Parque' },
      approximateDistanceM: null,
      provider: null,
    },
  ]);
  assert.equal(notes.nearbyPlaces, 'Las distancias son aproximadas.');
});

// ---------------------------------------------------------------- Precio vs. estimación

test('HU-012 distingue el precio del vendedor de la estimación de IA', async (t) => {
  mockDatabase(t);

  const { property, notes } = await (await request('7')).json();

  assert.equal(property.publicationPrice, 1500000);
  assert.deepEqual(property.estimate, {
    estimatedMin: 1300000,
    estimatedValue: 1450000,
    estimatedMax: 1600000,
    generatedAt: '2026-11-04T18:00:00.000Z',
  });
  assert.match(notes.publicationPrice, /vendedor/);
  assert.match(notes.estimate, /No es el precio de venta ni un avalúo oficial/);
});

// ---------------------------------------------------------------- CA4 · no disponible

for (const status of ['inactive', 'withdrawn']) {
  test(`HU-012 CA4 una propiedad ${status} responde 410 sin datos del inmueble`, async (t) => {
    const query = mockDatabase(t, { base: [{ ...ROW, status }] });

    const response = await request('7');
    const body = await response.json();

    assert.equal(response.status, 410);
    assert.deepEqual(body, { message: UNAVAILABLE_MESSAGE, available: false });
    assert.equal(query.mock.callCount(), 1, 'No debe cargar fotos, servicios ni entorno.');
  });
}

test('HU-012 CA4 un borrador responde 404 como si no existiera', async (t) => {
  const query = mockDatabase(t, { base: [{ ...ROW, status: 'draft' }] });

  const response = await request('7');

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: NOT_FOUND_MESSAGE });
  assert.equal(query.mock.callCount(), 1);
});

test('HU-012 CA4 un estado desconocido no se presenta como disponible', async (t) => {
  mockDatabase(t, { base: [{ ...ROW, status: 'archivada' }] });

  const response = await request('7');

  assert.equal(response.status, 404);
});

test('HU-012 una propiedad inexistente o eliminada responde 404', async (t) => {
  mockDatabase(t, { base: [] });

  const response = await request('999');

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: NOT_FOUND_MESSAGE });
});

for (const id of ['abc', '0', '-1', '1.5', '12345678901234567890']) {
  test(`HU-012 un id inválido (${id}) responde 404 sin consultar la base`, async (t) => {
    const query = mockDatabase(t);

    const response = await request(id);

    assert.equal(response.status, 404);
    assert.equal(query.mock.callCount(), 0);
  });
}

test('HU-012 /mine sigue requiriendo sesión y no se toma como :id', async (t) => {
  const query = mockDatabase(t);

  const response = await request('mine');

  assert.equal(response.status, 401);
  assert.equal(query.mock.callCount(), 0);
});

test('HU-012 un error de base de datos responde 500 sin detalles internos', async (t) => {
  t.mock.method(database, 'query', async () => {
    throw new Error('connection terminated: secreto interno');
  });

  const response = await request('7');
  const text = await response.text();

  assert.equal(response.status, 500);
  assert.equal(text.includes('secreto interno'), false);
});

// ---------------------------------------------------------------- Repositorio

test('HU-012 repository consulta una única propiedad no eliminada por id', async (t) => {
  const query = mockDatabase(t);

  const row = await repository.findPropertyForDetail('7');

  assert.equal(row.id, '7');
  const [sql, params] = query.mock.calls[0].arguments;
  const text = normalize(sql);
  assert.deepEqual(params, ['7']);
  assert.match(text, /WHERE p\.id = \$1 AND p\.deleted_at IS NULL LIMIT 1$/);
  assert.match(text, /LEFT JOIN property_features pf/);
  assert.match(text, /LEFT JOIN property_locations pl/);
  assert.equal(text.includes('owner_id'), false, 'No debe seleccionar al dueño.');
  assert.equal(text.includes('interior_number'), false, 'No debe seleccionar el número interior.');
});

test('HU-012 repository devuelve null si la propiedad no existe', async (t) => {
  mockDatabase(t, { base: [] });

  assert.equal(await repository.findPropertyForDetail('7'), null);
});

test('HU-012 repository carga las relaciones con filtros de visibilidad', async (t) => {
  const query = mockDatabase(t);

  await repository.findDetailRelations('7');

  const sqls = query.mock.calls.map((call) => normalize(call.arguments[0]));
  assert.equal(sqls.length, 4);
  for (const call of query.mock.calls) assert.deepEqual(call.arguments[1], ['7']);

  const photos = sqls.find((sql) => sql.includes('property_photos'));
  assert.equal(photos.includes('storage_key'), false);
  assert.match(photos, /ORDER BY is_primary DESC, sort_order ASC, id ASC/);

  assert.match(sqls.find((sql) => sql.includes('property_services')), /s\.is_active = TRUE/);
  assert.match(sqls.find((sql) => sql.includes('nearby_places')), /approximate_distance_m NULLS LAST/);

  const estimation = sqls.find((sql) => sql.includes('ai_estimations'));
  assert.match(estimation, /ORDER BY created_at DESC, id DESC LIMIT 1/);
  assert.equal(estimation.includes('explanation'), false);
  assert.equal(estimation.includes('model_'), false);
});
