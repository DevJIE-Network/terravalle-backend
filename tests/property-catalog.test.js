const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const propertyRepository = require('../src/repositories/property.repository');
const { listPublicProperties } = require('../src/controllers/property.controller');
const { listPublicPropertiesQuerySchema } = require('../src/schemas/property-catalog.schema');
const { app } = require('../src/server');

const PROPERTY = {
  id: '7',
  title: 'Casa en Tula',
  propertyType: { id: 2, name: 'Casa' },
  publicationPrice: 1500000,
  location: { municipality: 'Tula de Allende', state: 'Hidalgo', country: 'México' },
  landArea: 200,
  hasConstruction: true,
  builtArea: 150,
  primaryPhoto: { id: '15', imageUrl: '/uploads/properties/casa.jpg' },
};

const parse = (query) => listPublicPropertiesQuerySchema.safeParse(query);

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

function mockCatalog(t, properties = [PROPERTY]) {
  const count = t.mock.method(propertyRepository, 'countPublicProperties', async () => properties.length);
  const find = t.mock.method(propertyRepository, 'findPublicProperties', async ({ limit, offset }) => (
    properties.slice(offset, offset + limit)
  ));
  return { count, find };
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

function request(query = '', options) {
  return fetch(`${baseUrl}/api/properties${query}`, options);
}

// ---------------------------------------------------------------- Esquema

test('HU-010 esquema usa page=1 y limit=12 por omisión', () => {
  const result = parse({});
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { page: 1, limit: 12 });
});

test('HU-010 esquema acepta page válido sin cambiar el límite por omisión', () => {
  for (const page of ['2', 3, ' 4 ']) {
    const result = parse({ page });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { page: Number(page), limit: 12 });
  }
});

test('HU-010 esquema acepta limit válido, incluidos 1 y 50', () => {
  for (const limit of ['1', 12, '50']) {
    const result = parse({ limit });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { page: 1, limit: Number(limit) });
  }
});

const INVALID_QUERIES = [
  ['página cero', { page: '0' }, 'page'],
  ['página negativa', { page: '-1' }, 'page'],
  ['límite cero', { limit: '0' }, 'limit'],
  ['límite negativo', { limit: '-1' }, 'limit'],
  ['límite mayor de 50', { limit: '51' }, 'limit'],
  ['página no numérica', { page: 'abc' }, 'page'],
  ['límite no numérico', { limit: 'doce' }, 'limit'],
  ['página fraccionaria', { page: '1.5' }, 'page'],
  ['límite fraccionario', { limit: '2.5' }, 'limit'],
  ['página vacía', { page: '' }, 'page'],
  ['límite en blanco', { limit: '  ' }, 'limit'],
  ['página repetida', { page: ['1', '2'] }, 'page'],
  ['límite repetido', { limit: ['12', '24'] }, 'limit'],
  ['página booleana', { page: true }, 'page'],
  ['límite nulo', { limit: null }, 'limit'],
  ['página como objeto', { page: { value: '1' } }, 'page'],
  ['valor infinito', { page: Infinity }, 'page'],
  ['NaN', { limit: Number.NaN }, 'limit'],
  ['entero no seguro', { page: '9007199254740992' }, 'page'],
  ['offset no seguro', { page: '9007199254740991', limit: '50' }, 'page'],
  ['intento de inyección', { limit: '12; DROP TABLE properties' }, 'limit'],
];

for (const [name, query, field] of INVALID_QUERIES) {
  test(`HU-010 esquema rechaza ${name}`, () => {
    const result = parse(query);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === field));
  });
}

test('HU-010 esquema admite offsets seguros grandes sin desbordamiento', () => {
  const result = parse({ page: String(Number.MAX_SAFE_INTEGER), limit: '1' });
  assert.equal(result.success, true);
  assert.equal(result.data.page, Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger((result.data.page - 1) * result.data.limit));
});

test('HU-010 esquema ignora parámetros ajenos sin permitir filtros privados', () => {
  const result = parse({ status: 'draft', ownerId: '101', _: '12345' });
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { page: 1, limit: 12 });
});

// ---------------------------------------------------------------- Controlador y paginación

test('HU-010 controlador funciona sin req.auth y consulta el catálogo una sola vez', async (t) => {
  const { count, find } = mockCatalog(t);
  const res = mockRes();
  const next = t.mock.fn();

  await listPublicProperties({ query: {} }, res, next);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    properties: [PROPERTY],
    pagination: {
      page: 1, limit: 12, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    },
  });
  assert.equal(count.mock.callCount(), 1);
  assert.deepEqual(count.mock.calls[0].arguments, []);
  assert.equal(find.mock.callCount(), 1);
  assert.deepEqual(find.mock.calls[0].arguments, [{ limit: 12, offset: 0 }]);
  assert.equal(next.mock.callCount(), 0);
});

const CATALOG = Array.from({ length: 35 }, (_, index) => ({ ...PROPERTY, id: String(35 - index) }));

for (const [page, expectedIds, hasNextPage, hasPreviousPage] of [
  [1, ['35', '34', '33', '32', '31', '30', '29', '28', '27', '26', '25', '24'], true, false],
  [2, ['23', '22', '21', '20', '19', '18', '17', '16', '15', '14', '13', '12'], true, true],
  [3, ['11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1'], false, true],
  [4, [], false, true],
]) {
  test(`HU-010 página ${page} respeta el siguiente conjunto y calcula la paginación`, async (t) => {
    const { find } = mockCatalog(t, CATALOG);
    const res = mockRes();

    await listPublicProperties({ query: { page: String(page), limit: '12' } }, res, assert.fail);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.properties.map((property) => property.id), expectedIds);
    assert.deepEqual(res.body.pagination, {
      page, limit: 12, total: 35, totalPages: 3, hasNextPage, hasPreviousPage,
    });
    assert.deepEqual(find.mock.calls[0].arguments, [{ limit: 12, offset: (page - 1) * 12 }]);
  });
}

test('HU-010 respeta un límite personalizado y totalPages exacto sin redondear de más', async (t) => {
  mockCatalog(t, CATALOG.slice(0, 30));
  const res = mockRes();

  await listPublicProperties({ query: { page: '2', limit: '10' } }, res, assert.fail);

  assert.equal(res.body.properties.length, 10);
  assert.deepEqual(res.body.properties.map((property) => property.id), [
    '25', '24', '23', '22', '21', '20', '19', '18', '17', '16',
  ]);
  assert.deepEqual(res.body.pagination, {
    page: 2, limit: 10, total: 30, totalPages: 3, hasNextPage: true, hasPreviousPage: true,
  });
});

test('HU-010 consultas inválidas no ejecutan ningún método del repository', async (t) => {
  const { count, find } = mockCatalog(t);
  const next = t.mock.fn();

  for (const [, query, field] of INVALID_QUERIES) {
    const res = mockRes();
    await listPublicProperties({ query }, res, next);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Los parámetros de paginación no son válidos.');
    assert.ok(res.body.errors.some((error) => error.field === field && error.message.length > 0));
  }

  assert.equal(count.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 0);
  assert.equal(next.mock.callCount(), 0);
});

for (const method of ['countPublicProperties', 'findPublicProperties']) {
  test(`HU-010 un error de ${method} se delega a next(error) sin responder éxito`, async (t) => {
    mockCatalog(t);
    const failure = new Error('fallo de consulta simulado');
    t.mock.method(propertyRepository, method, async () => { throw failure; });
    const next = t.mock.fn();
    const res = mockRes();

    await listPublicProperties({ query: {} }, res, next);

    assert.equal(res.body, undefined);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(next.mock.calls[0].arguments[0], failure);
  });
}

// ---------------------------------------------------------------- HTTP: router y middleware reales

test('HU-010 GET /api/properties es público y devuelve un resumen sin JWT', async (t) => {
  mockCatalog(t);

  const response = await request();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    properties: [PROPERTY],
    pagination: {
      page: 1, limit: 12, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    },
  });
});

test('HU-010 el catálogo no valida ni necesita un JWT, aunque se envíe uno inválido', async (t) => {
  mockCatalog(t);

  const response = await request('', { headers: { Authorization: 'Bearer no-es-un-jwt' } });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).properties, [PROPERTY]);
});

test('HU-010 HTTP respeta page y limit sin permitir cambiar el estado público', async (t) => {
  const { count, find } = mockCatalog(t, CATALOG);

  const response = await request('?page=2&limit=12&status=withdrawn&ownerId=101');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.properties, CATALOG.slice(12, 24));
  assert.deepEqual(body.pagination, {
    page: 2, limit: 12, total: 35, totalPages: 3, hasNextPage: true, hasPreviousPage: true,
  });
  assert.deepEqual(count.mock.calls[0].arguments, []);
  assert.deepEqual(find.mock.calls[0].arguments, [{ limit: 12, offset: 12 }]);
});

test('HU-010 sin propiedades devuelve HTTP 200, properties vacío y paginación válida', async (t) => {
  mockCatalog(t, []);

  const response = await request();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    properties: [],
    pagination: {
      page: 1, limit: 12, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false,
    },
  });
});

test('HU-010 una página posterior vacía conserva el total y la página solicitada', async (t) => {
  mockCatalog(t);

  const response = await request('?page=2&limit=1');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    properties: [],
    pagination: {
      page: 2, limit: 1, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: true,
    },
  });
});

test('HU-010 HTTP rechaza query inválida y repetida con 400 antes de consultar datos', async (t) => {
  const { count, find } = mockCatalog(t);
  for (const query of [
    '?page=0', '?page=-1', '?limit=0', '?limit=51', '?page=abc', '?limit=doce',
    '?page=1.5', '?limit=2.5', '?page=', '?limit=', '?page=1&page=2', '?limit=1&limit=2',
    '?page=9007199254740991&limit=50', '?limit=1%3B%20DROP%20TABLE%20properties',
  ]) {
    const response = await request(query);
    const body = await response.json();
    assert.equal(response.status, 400, query);
    assert.ok(body.errors.length > 0);
    assert.equal(body.properties, undefined);
  }
  assert.equal(count.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 0);
});

test('HU-010 un error de consulta llega al middleware global y no filtra detalles internos', async (t) => {
  mockCatalog(t);
  const failure = new Error('detalle interno privado de PostgreSQL');
  t.mock.method(propertyRepository, 'findPublicProperties', async () => { throw failure; });
  const log = t.mock.method(console, 'error', () => {});

  const response = await request();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: 'Error interno del servidor.' });
  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[0], failure);
});

test('HU-010 no elimina rutas anteriores ni quita su autenticación', async () => {
  for (const [method, path] of [
    ['POST', ''], ['GET', '/mine'], ['GET', '/mine/7'], ['PATCH', '/7'],
    ['PATCH', '/7/status'], ['DELETE', '/7'], ['GET', '/7/characteristics'],
    ['PUT', '/7/characteristics'], ['GET', '/7/services'], ['PUT', '/7/services'],
    ['GET', '/7/location'], ['PUT', '/7/location'], ['GET', '/nearby-place-categories'],
    ['GET', '/7/nearby-places'], ['POST', '/7/nearby-places'],
    ['DELETE', '/7/nearby-places/1'], ['POST', '/7/photos'],
    ['POST', '/7/estimations'], ['GET', '/7/estimations'],
  ]) {
    const response = await request(path, { method });
    assert.equal(response.status, 401, `${method} /api/properties${path}`);
    assert.deepEqual(await response.json(), { message: 'Sesión no válida o expirada.' });
  }
});
