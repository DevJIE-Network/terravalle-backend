const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const database = require('../src/config/database');
const propertyRepository = require('../src/repositories/property.repository');
const serviceRepository = require('../src/repositories/service.repository');
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
  primaryPhoto: null,
};

const parse = (query) => listPublicPropertiesQuerySchema.safeParse(query);
const fieldsWithError = (result) => result.error.issues.map((issue) => issue.path.join('.'));

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
  const find = t.mock.method(propertyRepository, 'findPublicProperties', async () => properties);
  return { count, find };
}

function mockServices(t, ids = [1, 2, 3]) {
  return t.mock.method(serviceRepository, 'findActiveServicesByIds', async (requested) => (
    requested.filter((id) => ids.includes(id)).map((id) => ({ id, name: `Servicio ${id}`, description: null }))
  ));
}

// El repository captura `query` al importarse (mismo patrón que property-catalog.repository.test.js).
function mockDatabase(t, ...results) {
  let index = 0;
  const query = t.mock.method(database, 'query', async () => results[index++] ?? { rows: [] });
  const repositoryPath = require.resolve('../src/repositories/property.repository');
  delete require.cache[repositoryPath];
  const repository = require(repositoryPath);
  t.after(() => { delete require.cache[repositoryPath]; });
  return { repository, query };
}

const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();

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

// ---------------------------------------------------------------- Esquema

test('HU-011 esquema sin filtros no produce criterios (catálogo general)', () => {
  const result = parse({});
  assert.equal(result.success, true);
  assert.deepEqual(result.data.filters, {});
});

test('HU-011 esquema normaliza y combina todos los filtros válidos', () => {
  const result = parse({
    q: '  casa   tula ',
    propertyTypeId: '2',
    minPrice: '100000',
    maxPrice: '2000000.50',
    state: ' Hidalgo ',
    municipality: 'Tula',
    minLandArea: '100',
    maxLandArea: '500.5',
    hasConstruction: 'TRUE',
    minBuiltArea: '50',
    maxBuiltArea: '300',
    serviceIds: '1,2,2,3',
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data.filters, {
    q: 'casa tula',
    propertyTypeId: 2,
    minPrice: 100000,
    maxPrice: 2000000.5,
    state: 'Hidalgo',
    municipality: 'Tula',
    minLandArea: 100,
    maxLandArea: 500.5,
    hasConstruction: true,
    minBuiltArea: 50,
    maxBuiltArea: 300,
    serviceIds: [1, 2, 3],
  });
});

test('HU-011 esquema trata los campos vacíos como "sin filtro" (limpiar filtros)', () => {
  const result = parse({
    q: '', propertyTypeId: '', minPrice: ' ', maxPrice: '', state: '', municipality: '  ',
    minLandArea: '', maxLandArea: '', hasConstruction: '', minBuiltArea: '', maxBuiltArea: '', serviceIds: '',
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.filters, {});
});

test('HU-011 esquema acepta serviceIds repetidos y separados por comas', () => {
  assert.deepEqual(parse({ serviceIds: ['1', '2'] }).data.filters.serviceIds, [1, 2]);
  assert.deepEqual(parse({ serviceIds: ['1,2', '3'] }).data.filters.serviceIds, [1, 2, 3]);
  assert.deepEqual(parse({ serviceIds: ' 4 , 5 ' }).data.filters.serviceIds, [4, 5]);
});

test('HU-011 esquema acepta límites exactos y valores en cero', () => {
  const result = parse({ minPrice: '0', maxPrice: '0', minLandArea: '10', maxLandArea: '10' });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.filters, { minPrice: 0, maxPrice: 0, minLandArea: 10, maxLandArea: 10 });
});

const INVALID_FILTERS = [
  // CA4: rangos incoherentes
  ['precio mínimo mayor que máximo', { minPrice: '500', maxPrice: '100' }, 'minPrice'],
  ['terreno mínimo mayor que máximo', { minLandArea: '500', maxLandArea: '100' }, 'minLandArea'],
  ['construcción mínima mayor que máxima', { minBuiltArea: '500', maxBuiltArea: '100' }, 'minBuiltArea'],
  // Tipos y rangos
  ['precio negativo', { minPrice: '-1' }, 'minPrice'],
  ['superficie negativa', { maxLandArea: '-5' }, 'maxLandArea'],
  ['precio no numérico', { minPrice: 'barato' }, 'minPrice'],
  ['notación científica', { minPrice: '1e3' }, 'minPrice'],
  ['Infinity', { maxPrice: 'Infinity' }, 'maxPrice'],
  ['NaN numérico', { maxPrice: Number.NaN }, 'maxPrice'],
  ['más de dos decimales', { minPrice: '10.999' }, 'minPrice'],
  ['precio sobre el límite de la columna', { maxPrice: '1000000000000' }, 'maxPrice'],
  ['superficie sobre el límite', { maxLandArea: '10000001' }, 'maxLandArea'],
  ['precio repetido', { minPrice: ['1', '2'] }, 'minPrice'],
  ['precio como objeto', { minPrice: { $gt: 1 } }, 'minPrice'],
  ['precio booleano', { minPrice: true }, 'minPrice'],
  ['booleano inválido', { hasConstruction: 'quizás' }, 'hasConstruction'],
  ['booleano repetido', { hasConstruction: ['true', 'false'] }, 'hasConstruction'],
  ['tipo no numérico', { propertyTypeId: 'casa' }, 'propertyTypeId'],
  ['tipo cero', { propertyTypeId: '0' }, 'propertyTypeId'],
  ['tipo decimal', { propertyTypeId: '1.5' }, 'propertyTypeId'],
  ['tipo fuera de smallint', { propertyTypeId: '32768' }, 'propertyTypeId'],
  ['tipo repetido', { propertyTypeId: ['1', '2'] }, 'propertyTypeId'],
  ['servicio no numérico', { serviceIds: '1,agua' }, 'serviceIds'],
  ['servicio cero', { serviceIds: '0' }, 'serviceIds'],
  ['servicio negativo', { serviceIds: '-1' }, 'serviceIds'],
  ['servicio fuera de smallint', { serviceIds: '32768' }, 'serviceIds'],
  ['demasiados servicios', { serviceIds: Array.from({ length: 31 }, (_, i) => i + 1).join(',') }, 'serviceIds'],
  ['texto demasiado largo', { q: 'a'.repeat(101) }, 'q'],
  ['estado demasiado largo', { state: 'a'.repeat(121) }, 'state'],
  ['texto repetido', { municipality: ['a', 'b'] }, 'municipality'],
  ['texto como objeto', { q: { a: 1 } }, 'q'],
];

for (const [name, query, field] of INVALID_FILTERS) {
  test(`HU-011 esquema rechaza ${name}`, () => {
    const result = parse(query);
    assert.equal(result.success, false);
    assert.ok(fieldsWithError(result).includes(field), `esperaba error en ${field}`);
    assert.ok(result.error.issues.every((issue) => issue.message.length > 0));
  });
}

test('HU-011 esquema reporta todos los filtros inválidos a la vez', () => {
  const result = parse({ minPrice: '10', maxPrice: '1', hasConstruction: 'x', propertyTypeId: 'y' });
  assert.deepEqual(fieldsWithError(result).sort(), ['hasConstruction', 'minPrice', 'propertyTypeId']);
});

test('HU-011 esquema ignora parámetros desconocidos y no permite cambiar el estado', () => {
  const result = parse({ status: 'draft', ownerId: '1', orderBy: 'price; DROP TABLE x' });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.filters, {});
});

// ---------------------------------------------------------------- Repository (SQL real emitido)

test('HU-011 repository sin filtros conserva el SQL de HU-010 y sus parámetros', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [{ total: '0' }] }, { rows: [] });

  await repository.countPublicProperties();
  await repository.findPublicProperties({ limit: 12, offset: 0 });

  assert.deepEqual(query.mock.calls[0].arguments[1], []);
  assert.deepEqual(query.mock.calls[1].arguments[1], [12, 0]);
  assert.doesNotMatch(normalize(query.mock.calls[0].arguments[0]), /ILIKE|property_services|\$1/);
});

test('HU-011 repository agrega cada filtro con AND y solo con parámetros', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] });
  const filters = {
    q: 'casa', propertyTypeId: 2, minPrice: 100, maxPrice: 900, state: 'Hid', municipality: 'Tula',
    minLandArea: 50, maxLandArea: 400, hasConstruction: true, minBuiltArea: 20, maxBuiltArea: 300,
    serviceIds: [1, 2],
  };

  await repository.findPublicProperties({ limit: 5, offset: 10, filters });

  const [rawSql, params] = query.mock.calls[0].arguments;
  const sql = normalize(rawSql);
  // Las condiciones base de HU-010 (solo activas) siguen primero.
  assert.match(sql, /WHERE p\.status = 'active' AND p\.deleted_at IS NULL AND/);
  for (const fragment of [
    "(p.title ILIKE $1 ESCAPE '\\' OR pl.municipality ILIKE $1 ESCAPE '\\' OR pl.state ILIKE $1 ESCAPE '\\')",
    'p.property_type_id = $2::smallint',
    'p.publication_price >= $3::numeric',
    'p.publication_price <= $4::numeric',
    "pl.state ILIKE $5 ESCAPE '\\'",
    "pl.municipality ILIKE $6 ESCAPE '\\'",
    'pf.land_area_m2 >= $7::numeric',
    'pf.land_area_m2 <= $8::numeric',
    'pf.has_construction = $9::boolean',
    'pf.built_area_m2 >= $10::numeric',
    'pf.built_area_m2 <= $11::numeric',
    'ps.service_id = ANY($12::smallint[])) = CARDINALITY($12::smallint[])',
    'LIMIT $13 OFFSET $14',
  ]) {
    assert.ok(sql.includes(fragment), `falta: ${fragment}`);
  }
  assert.deepEqual(params, ['%casa%', 2, 100, 900, '%Hid%', '%Tula%', 50, 400, true, 20, 300, [1, 2], 5, 10]);
  assert.match(sql, /ORDER BY p\.published_at DESC NULLS LAST, p\.id DESC LIMIT/);
});

test('HU-011 repository nunca concatena valores del usuario en el SQL', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] }, { rows: [{ total: '0' }] });
  const attack = "x'; DROP TABLE properties; --";

  await repository.findPublicProperties({ filters: { q: attack, state: attack, municipality: attack } });
  await repository.countPublicProperties({ q: attack });

  for (const call of query.mock.calls) {
    assert.equal(call.arguments[0].includes('DROP TABLE'), false);
    assert.ok(call.arguments[1].some((value) => typeof value === 'string' && value.includes('DROP TABLE')));
  }
});

test('HU-011 repository escapa % _ y \\ para buscarlos como texto literal', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] });

  await repository.findPublicProperties({ filters: { q: '100%_a\\b' } });

  assert.equal(query.mock.calls[0].arguments[1][0], '%100\\%\\_a\\\\b%');
});

test('HU-011 repository conteo y listado comparten condiciones y parámetros de filtro', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [{ total: '3' }] }, { rows: [] });
  const filters = { propertyTypeId: 1, maxPrice: 500, serviceIds: [1, 2] };

  assert.equal(await repository.countPublicProperties(filters), 3);
  await repository.findPublicProperties({ limit: 2, offset: 2, filters });

  const countSql = normalize(query.mock.calls[0].arguments[0]);
  const findSql = normalize(query.mock.calls[1].arguments[0]);
  const countWhere = countSql.slice(countSql.indexOf(' WHERE ') + ' WHERE '.length);
  const findWhere = findSql.split(') photo ON TRUE WHERE ')[1].split(' ORDER BY ')[0];
  assert.equal(countWhere, findWhere);
  assert.deepEqual(query.mock.calls[0].arguments[1], [1, 500, [1, 2]]);
  assert.deepEqual(query.mock.calls[1].arguments[1], [1, 500, [1, 2], 2, 2]);
  assert.doesNotMatch(countSql, /LIMIT|OFFSET/);
});

test('HU-011 repository ignora serviceIds vacío y no filtra por estado ajeno', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] });

  await repository.findPublicProperties({ filters: { serviceIds: [], status: 'withdrawn' } });

  const sql = normalize(query.mock.calls[0].arguments[0]);
  assert.doesNotMatch(sql, /property_services|withdrawn/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [12, 0]);
});

// ---------------------------------------------------------------- Controlador

test('HU-011 CA1: pasa los filtros válidos al repository y los devuelve aplicados', async (t) => {
  const { count, find } = mockCatalog(t);
  const res = mockRes();

  await listPublicProperties({ query: { propertyTypeId: '2', maxPrice: '2000000', page: '1', limit: '12' } }, res, assert.fail);

  const filters = { propertyTypeId: 2, maxPrice: 2000000 };
  assert.equal(res.statusCode, 200);
  assert.deepEqual(count.mock.calls[0].arguments, [filters]);
  assert.deepEqual(find.mock.calls[0].arguments, [{ limit: 12, offset: 0, filters }]);
  assert.deepEqual(res.body.properties, [PROPERTY]);
  assert.deepEqual(res.body.filters, filters);
  assert.equal(res.body.message, undefined);
});

test('HU-011 CA2: sin coincidencias responde 200 con lista vacía y mensaje, sin error', async (t) => {
  mockCatalog(t, []);
  const next = t.mock.fn();
  const res = mockRes();

  await listPublicProperties({ query: { propertyTypeId: '3', state: 'Jalisco' } }, res, next);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.properties, []);
  assert.equal(res.body.pagination.total, 0);
  assert.equal(res.body.pagination.totalPages, 0);
  assert.match(res.body.message, /No se encontraron propiedades/);
  assert.equal(next.mock.callCount(), 0);
});

test('HU-011 CA3: sin filtros (o con filtros vacíos) vuelve al catálogo general', async (t) => {
  const { find } = mockCatalog(t);

  for (const query of [{}, { q: '', propertyTypeId: '', minPrice: '' }]) {
    const res = mockRes();
    await listPublicProperties({ query }, res, assert.fail);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body), ['properties', 'pagination']);
  }
  for (const call of find.mock.calls) {
    assert.deepEqual(call.arguments, [{ limit: 12, offset: 0, filters: {} }]);
  }
});

test('HU-011 CA4: un rango inválido responde 400 y no consulta datos', async (t) => {
  const { count, find } = mockCatalog(t);
  const services = mockServices(t);
  const res = mockRes();

  await listPublicProperties({ query: { minPrice: '900', maxPrice: '100' } }, res, assert.fail);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Los parámetros de búsqueda no son válidos.');
  assert.deepEqual(res.body.errors, [{
    field: 'minPrice', message: 'El precio mínimo no puede ser mayor que el máximo.',
  }]);
  assert.equal(count.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 0);
  assert.equal(services.mock.callCount(), 0);
});

test('HU-011 mantiene paginación y offset al aplicar filtros', async (t) => {
  const { count, find } = mockCatalog(t);
  const res = mockRes();

  await listPublicProperties({ query: { state: 'Hidalgo', page: '3', limit: '5' } }, res, assert.fail);

  assert.deepEqual(find.mock.calls[0].arguments, [{ limit: 5, offset: 10, filters: { state: 'Hidalgo' } }]);
  assert.deepEqual(count.mock.calls[0].arguments, [{ state: 'Hidalgo' }]);
  assert.equal(res.body.pagination.page, 3);
  assert.equal(res.body.pagination.limit, 5);
});

test('HU-011 regla de negocio: los servicios del filtro deben existir en el catálogo', async (t) => {
  const { count, find } = mockCatalog(t);
  const services = mockServices(t, [1, 2]);
  const res = mockRes();

  await listPublicProperties({ query: { serviceIds: '1,2,99,100' } }, res, assert.fail);

  assert.deepEqual(services.mock.calls[0].arguments, [[1, 2, 99, 100]]);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.errors[0].field, 'serviceIds');
  assert.match(res.body.errors[0].message, /99, 100/);
  assert.equal(count.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 0);
});

test('HU-011 acepta servicios válidos del catálogo', async (t) => {
  const { find } = mockCatalog(t);
  mockServices(t, [1, 2, 3]);
  const res = mockRes();

  await listPublicProperties({ query: { serviceIds: ['1', '3'] } }, res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(find.mock.calls[0].arguments[0].filters, { serviceIds: [1, 3] });
});

test('HU-011 no consulta el catálogo de servicios si no se filtra por servicios', async (t) => {
  mockCatalog(t);
  const services = mockServices(t);

  await listPublicProperties({ query: { propertyTypeId: '1' } }, mockRes(), assert.fail);

  assert.equal(services.mock.callCount(), 0);
});

test('HU-011 los errores inesperados del repository o del catálogo de servicios van a next(error)', async (t) => {
  const failure = new Error('fallo simulado');

  mockCatalog(t);
  t.mock.method(serviceRepository, 'findActiveServicesByIds', async () => { throw failure; });
  const next = t.mock.fn();
  const res = mockRes();
  await listPublicProperties({ query: { serviceIds: '1' } }, res, next);

  assert.equal(res.body, undefined);
  assert.equal(next.mock.calls[0].arguments[0], failure);
});

// ---------------------------------------------------------------- HTTP (router real)

test('HU-011 GET /api/properties con filtros es público y devuelve resultados', async (t) => {
  const { find } = mockCatalog(t);
  mockServices(t);

  const response = await fetch(
    `${baseUrl}/api/properties?propertyTypeId=2&minPrice=100000&maxPrice=2000000&state=Hidalgo`
    + '&hasConstruction=true&serviceIds=1&serviceIds=2&q=casa',
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.properties, [PROPERTY]);
  assert.deepEqual(find.mock.calls[0].arguments[0].filters, {
    q: 'casa',
    propertyTypeId: 2,
    minPrice: 100000,
    maxPrice: 2000000,
    state: 'Hidalgo',
    hasConstruction: true,
    serviceIds: [1, 2],
  });
});

test('HU-011 HTTP responde 400 con errores por campo ante un rango inválido', async (t) => {
  const { count, find } = mockCatalog(t);

  const response = await fetch(`${baseUrl}/api/properties?minLandArea=500&maxLandArea=100&hasConstruction=quizas`);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body.errors.map((error) => error.field).sort(), ['hasConstruction', 'minLandArea']);
  assert.equal(count.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 0);
});

test('HU-011 HTTP sin resultados responde 200 (no es un error)', async (t) => {
  mockCatalog(t, []);

  const response = await fetch(`${baseUrl}/api/properties?maxPrice=1`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.properties, []);
  assert.match(body.message, /No se encontraron/);
});

test('HU-011 HTTP no permite consultar propiedades que no son activas mediante status', async (t) => {
  const { find } = mockCatalog(t);

  const response = await fetch(`${baseUrl}/api/properties?status=withdrawn&ownerId=1`);

  assert.equal(response.status, 200);
  assert.deepEqual(find.mock.calls[0].arguments[0].filters, {});
});

test('HU-011 HTTP: /mine y /:id no se interpretan como filtros del catálogo', async () => {
  const response = await fetch(`${baseUrl}/api/properties/mine`);
  assert.equal(response.status, 401);
});
