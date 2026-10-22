const assert = require('node:assert/strict');
const { test } = require('node:test');
const propertyRepository = require('../src/repositories/property.repository');
const serviceRepository = require('../src/repositories/service.repository');
const { getServices, saveServices } = require('../src/controllers/property.controller');
const { listServices } = require('../src/controllers/service.controller');
const {
  saveServicesSchema,
  uniqueServiceIds,
} = require('../src/schemas/property-services.schema');

const OWNER_ID = '101';
const PROPERTY = { id: '7', ownerId: OWNER_ID, title: 'Casa en Tula' };

// Catálogo inicial de TerraValle (script SQL).
const CATALOG = [
  { id: 1, name: 'Agua potable', description: null },
  { id: 2, name: 'Electricidad', description: null },
  { id: 3, name: 'Drenaje', description: null },
  { id: 4, name: 'Gas', description: null },
  { id: 5, name: 'Internet', description: null },
  { id: 6, name: 'Alumbrado público', description: null },
  { id: 7, name: 'Pavimentación', description: null },
  { id: 8, name: 'Banqueta', description: null },
];
const byIds = (ids) => CATALOG.filter((service) => ids.includes(service.id));

const parse = (body) => saveServicesSchema.safeParse(body);

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

// El catálogo responde solo con los id que existen y están activos.
function mockCatalog(t) {
  t.mock.method(serviceRepository, 'findActiveServicesByIds', async (ids) => byIds(ids));
}

// ---------------------------------------------------------------- Esquema

test('HU-006 el esquema acepta una lista de servicios y la lista vacía', () => {
  assert.equal(parse({ serviceIds: [1, 2, 3] }).success, true);
  assert.equal(parse({ serviceIds: [] }).success, true);
  assert.deepEqual(parse({ serviceIds: ['1', '5'] }).data, { serviceIds: [1, 5] });
});

test('HU-006 el esquema rechaza datos inválidos o campos desconocidos', () => {
  assert.equal(parse({}).success, false);
  assert.equal(parse({ serviceIds: 'agua' }).success, false);
  assert.equal(parse({ serviceIds: [0] }).success, false);
  assert.equal(parse({ serviceIds: [-1] }).success, false);
  assert.equal(parse({ serviceIds: [1.5] }).success, false);
  assert.equal(parse({ serviceIds: ['agua'] }).success, false);
  assert.equal(parse({ serviceIds: [1], extra: true }).success, false);
  assert.equal(parse({ serviceIds: Array.from({ length: 31 }, (_, i) => i + 1) }).success, false);
});

test('HU-006 regla: un mismo servicio no se repite en la propiedad', () => {
  assert.deepEqual(uniqueServiceIds([2, 1, 2, 5, 1]), [2, 1, 5]);
});

// ---------------------------------------------------------------- Catálogo

test('HU-006 el catálogo devuelve los servicios activos de TerraValle', async (t) => {
  t.mock.method(serviceRepository, 'listActiveServices', async () => CATALOG);
  const res = mockRes();

  await listServices({}, res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.services.map((service) => service.name), [
    'Agua potable', 'Electricidad', 'Drenaje', 'Gas',
    'Internet', 'Alumbrado público', 'Pavimentación', 'Banqueta',
  ]);
});

// ---------------------------------------------------------------- Guardar

test('HU-006 CA1 el dueño guarda los servicios y se asocian a su propiedad', async (t) => {
  mockProperty(t);
  mockCatalog(t);
  const replace = t.mock.method(serviceRepository, 'replacePropertyServices', async (_id, ids) => byIds(ids));
  const res = mockRes();

  await saveServices(mockReq({ body: { serviceIds: [1, 2, 3] } }), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Servicios de la propiedad guardados correctamente.');
  assert.deepEqual(res.body.services.map((service) => service.id), [1, 2, 3]);
  assert.deepEqual(replace.mock.calls[0].arguments, ['7', [1, 2, 3]]);
});

test('HU-006 CA1 los servicios repetidos se guardan una sola vez', async (t) => {
  mockProperty(t);
  mockCatalog(t);
  const replace = t.mock.method(serviceRepository, 'replacePropertyServices', async (_id, ids) => byIds(ids));

  await saveServices(mockReq({ body: { serviceIds: [1, 1, 5, 5] } }), mockRes(), assert.fail);

  assert.deepEqual(replace.mock.calls[0].arguments[1], [1, 5]);
});

test('HU-006 CA2 al desmarcar un servicio se envía la nueva selección completa', async (t) => {
  mockProperty(t);
  mockCatalog(t);
  const replace = t.mock.method(serviceRepository, 'replacePropertyServices', async (_id, ids) => byIds(ids));
  const res = mockRes();

  // Antes tenía agua, electricidad y gas; ahora el gas deja de estar disponible.
  await saveServices(mockReq({ body: { serviceIds: [1, 2] } }), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(replace.mock.calls[0].arguments[1], [1, 2]);
  assert.deepEqual(res.body.services.map((service) => service.name), ['Agua potable', 'Electricidad']);
});

test('HU-006 CA2 una lista vacía quita todos los servicios', async (t) => {
  mockProperty(t);
  mockCatalog(t);
  const replace = t.mock.method(serviceRepository, 'replacePropertyServices', async () => []);
  const res = mockRes();

  await saveServices(mockReq({ body: { serviceIds: [] } }), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.services, []);
  assert.deepEqual(replace.mock.calls[0].arguments[1], []);
});

test('HU-006 rechaza servicios fuera del catálogo o inactivos sin guardar', async (t) => {
  mockProperty(t);
  mockCatalog(t);
  const replace = t.mock.method(serviceRepository, 'replacePropertyServices', async () => {
    throw new Error('No debe guardar servicios inválidos.');
  });
  const res = mockRes();

  await saveServices(mockReq({ body: { serviceIds: [1, 99, 42] } }), res, assert.fail);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.invalidServiceIds, [99, 42]);
  assert.equal(replace.mock.callCount(), 0);
});

test('HU-006 datos con formato inválido devuelven 400 con el detalle', async (t) => {
  mockProperty(t);
  const replace = t.mock.method(serviceRepository, 'replacePropertyServices', async () => {
    throw new Error('No debe guardar.');
  });
  const res = mockRes();

  await saveServices(mockReq({ body: { serviceIds: 'agua' } }), res, assert.fail);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'La selección de servicios no es válida.');
  assert.deepEqual(res.body.errors.map((error) => error.field), ['serviceIds']);
  assert.equal(replace.mock.callCount(), 0);
});

// ---------------------------------------------------------------- Consultar

test('HU-006 CA3 el dueño consulta los servicios vigentes de su propiedad', async (t) => {
  mockProperty(t);
  const find = t.mock.method(serviceRepository, 'findServicesByPropertyId', async () => byIds([1, 3, 6]));
  const res = mockRes();

  await getServices(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.services.map((service) => service.name), [
    'Agua potable', 'Drenaje', 'Alumbrado público',
  ]);
  assert.deepEqual(find.mock.calls[0].arguments, ['7']);
});

test('HU-006 CA3 una propiedad sin servicios registrados devuelve una lista vacía', async (t) => {
  mockProperty(t);
  t.mock.method(serviceRepository, 'findServicesByPropertyId', async () => []);
  const res = mockRes();

  await getServices(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { services: [] });
});

// ---------------------------------------------------------------- Propiedad ajena / inexistente

test('HU-006 CA4 modificar los servicios de una propiedad ajena devuelve 403', async (t) => {
  mockProperty(t);
  const replace = t.mock.method(serviceRepository, 'replacePropertyServices', async () => {
    throw new Error('No debe modificar una propiedad ajena.');
  });
  const res = mockRes();

  await saveServices(mockReq({ body: { serviceIds: [1] }, userId: '202' }), res, assert.fail);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'No tienes permiso para modificar esta propiedad.');
  assert.equal(replace.mock.callCount(), 0);
});

test('HU-006 CA4 consultar los servicios de una propiedad ajena devuelve 403', async (t) => {
  mockProperty(t);
  const find = t.mock.method(serviceRepository, 'findServicesByPropertyId', async () => []);
  const res = mockRes();

  await getServices(mockReq({ userId: '202' }), res, assert.fail);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'No tienes permiso para consultar esta propiedad.');
  assert.equal(find.mock.callCount(), 0);
});

test('HU-006 una propiedad inexistente devuelve 404', async (t) => {
  mockProperty(t);
  const res = mockRes();

  await saveServices(mockReq({ id: '999', body: { serviceIds: [1] } }), res, assert.fail);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Propiedad no encontrada.');
});

test('HU-006 un error de base de datos se delega al manejador global', async (t) => {
  mockProperty(t);
  mockCatalog(t);
  const dbError = new Error('fallo de conexión');
  t.mock.method(serviceRepository, 'replacePropertyServices', async () => {
    throw dbError;
  });
  let received;

  await saveServices(mockReq({ body: { serviceIds: [1] } }), mockRes(), (error) => {
    received = error;
  });

  assert.equal(received, dbError);
});
