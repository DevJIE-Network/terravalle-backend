const assert = require('node:assert/strict');
const { test } = require('node:test');
const database = require('../src/config/database');

const ROW = {
  id: '9007199254740993',
  title: 'Casa en Tula',
  property_type_id: '2',
  property_type_name: 'Casa',
  publication_price: '1500000.50',
  municipality: 'Tula de Allende',
  state: 'Hidalgo',
  country: 'México',
  land_area_m2: '200.25',
  has_construction: true,
  built_area_m2: '150.50',
  primary_photo_id: '9007199254740995',
  primary_photo_url: '/uploads/properties/casa.jpg',
};
const PROPERTY = {
  id: ROW.id,
  title: 'Casa en Tula',
  propertyType: { id: 2, name: 'Casa' },
  publicationPrice: 1500000.5,
  location: { municipality: 'Tula de Allende', state: 'Hidalgo', country: 'México' },
  landArea: 200.25,
  hasConstruction: true,
  builtArea: 150.5,
  primaryPhoto: { id: ROW.primary_photo_id, imageUrl: ROW.primary_photo_url },
};

// Mismo patrón que property-location.repository.test.js: query se captura al importar.
function mockDatabase(t, ...results) {
  let index = 0;
  const query = t.mock.method(database, 'query', async () => {
    assert.ok(index < results.length, 'No debe ejecutar consultas adicionales.');
    const result = results[index++];
    if (result instanceof Error) throw result;
    return result;
  });
  const repositoryPath = require.resolve('../src/repositories/property.repository');
  delete require.cache[repositoryPath];
  const repository = require(repositoryPath);
  t.after(() => { delete require.cache[repositoryPath]; });
  return { repository, query };
}

const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();

// Se verifica el SQL real emitido: el mock no implementa ni simula filtros SQL.
const EXPECTED_FILTERS = "p.status = 'active' AND p.deleted_at IS NULL AND pt.is_active = TRUE "
  + 'AND CHAR_LENGTH(BTRIM(p.title)) >= 3 AND p.publication_price IS NOT NULL '
  + 'AND p.publication_price >= 0 AND pf.land_area_m2 > 0 '
  + 'AND (pf.has_construction = FALSE OR pf.built_area_m2 > 0) '
  + "AND NULLIF(BTRIM(pl.municipality), '') IS NOT NULL AND NULLIF(BTRIM(pl.state), '') IS NOT NULL";

test('HU-010 repository cuenta las publicaciones públicas y convierte COUNT a número', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [{ total: '35' }] });

  assert.equal(await repository.countPublicProperties(), 35);
  assert.equal(query.mock.callCount(), 1);
  const sql = normalize(query.mock.calls[0].arguments[0]);
  assert.ok(sql.startsWith('SELECT COUNT(*) AS total FROM properties p '));
  assert.ok(sql.endsWith(`WHERE ${EXPECTED_FILTERS}`));
  assert.doesNotMatch(sql, /property_photos|LIMIT|OFFSET/);
});

test('HU-010 repository el conteo vacío es cero y no es un error', async (t) => {
  const { repository } = mockDatabase(t, { rows: [{ total: '0' }] });
  assert.equal(await repository.countPublicProperties(), 0);
});

test('HU-010 repository mapea únicamente el resumen público y conserva los BIGINT como texto', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [{
    ...ROW,
    owner_id: '101',
    ownerId: '101',
    email: 'privado@example.com',
    phone: '5512345678',
    password_hash: 'hash-privado',
    refresh_token_hash: 'sesión-privada',
    description: 'Ficha técnica completa',
    deleted_at: null,
    storage_key: 'clave-interna',
    street: 'Dirección exacta privada',
    latitude: '20.053',
    longitude: '-99.343',
  }] });

  assert.deepEqual(await repository.findPublicProperties({ limit: 12, offset: 0 }), [PROPERTY]);
  assert.equal(query.mock.callCount(), 1);
});

test('HU-010 repository no consulta ni proyecta datos del vendedor o administrativos', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [ROW] });

  await repository.findPublicProperties();

  const sql = normalize(query.mock.calls[0].arguments[0]);
  const projection = sql.split(' FROM properties p ')[0];
  assert.equal(projection, 'SELECT p.id, p.title, p.property_type_id, pt.name AS property_type_name, '
    + 'p.publication_price, pl.municipality, pl.state, pl.country, '
    + 'pf.land_area_m2, pf.has_construction, pf.built_area_m2, '
    + 'photo.id AS primary_photo_id, photo.image_url AS primary_photo_url');
  assert.doesNotMatch(sql, /\b(users|sessions|owner_id|email|phone|password_hash|storage_key|property_contact_channels|property_status_history)\b/);
  assert.doesNotMatch(projection, /\*|description|deleted_at|withdrawn_at|created_at|updated_at|latitude|longitude|street/);
});

test('HU-010 repository lista exclusivamente active y excluye draft, inactive y withdrawn', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [ROW] }, { rows: [{ total: '1' }] });

  assert.deepEqual(await repository.findPublicProperties(), [PROPERTY]);
  assert.equal(await repository.countPublicProperties(), 1);

  for (const call of query.mock.calls) {
    const sql = normalize(call.arguments[0]);
    assert.match(sql, /WHERE p.status = 'active' AND p.deleted_at IS NULL AND/);
    assert.doesNotMatch(sql, /\bOR p\.status|p\.status IN|status\s*(?:<>|!=)/);
    for (const status of ['draft', 'inactive', 'withdrawn']) {
      assert.equal(sql.includes(`'${status}'`), false);
    }
  }
});

test('HU-010 repository excluye publicaciones incompletas con los mínimos reales del resumen', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] });

  assert.deepEqual(await repository.findPublicProperties(), []);

  const sql = normalize(query.mock.calls[0].arguments[0]);
  assert.match(sql, /INNER JOIN property_types pt ON pt.id = p.property_type_id/);
  assert.match(sql, /INNER JOIN property_features pf ON pf.property_id = p.id/);
  assert.match(sql, /INNER JOIN property_locations pl ON pl.property_id = p.id/);
  assert.ok(sql.includes(`WHERE ${EXPECTED_FILTERS} ORDER BY p.published_at`));
  // No inventa como obligatorios fotos, servicios, calidad o la estimación de HU-009.
  assert.doesNotMatch(sql, /INNER JOIN property_photos|property_services|construction_quality|ai_estimations/);
});

test('HU-010 repository conteo y listado comparten exactamente los mismos filtros', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [{ total: '0' }] }, { rows: [] });

  await repository.countPublicProperties();
  await repository.findPublicProperties();

  const countSql = normalize(query.mock.calls[0].arguments[0]);
  const findSql = normalize(query.mock.calls[1].arguments[0]);
  assert.equal(countSql.split(' WHERE ')[1], EXPECTED_FILTERS);
  assert.equal(findSql.split(') photo ON TRUE WHERE ')[1].split(' ORDER BY ')[0], EXPECTED_FILTERS);
});

test('HU-010 repository parametriza LIMIT/OFFSET y usa orden determinista por publicación e id', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [ROW] });

  await repository.findPublicProperties({ limit: 5, offset: 10 });

  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(normalize(sql), /ORDER BY p.published_at DESC NULLS LAST, p.id DESC LIMIT \$1 OFFSET \$2$/);
  assert.deepEqual(params, [5, 10]);
  assert.doesNotMatch(sql, /LIMIT 5|OFFSET 10/);
});

test('HU-010 repository conserva el orden de PostgreSQL y páginas sucesivas sin duplicar ids', async (t) => {
  const rows = [{ ...ROW, id: '12' }, { ...ROW, id: '11' }, { ...ROW, id: '10' }];
  const { repository, query } = mockDatabase(t, { rows: rows.slice(0, 2) }, { rows: rows.slice(2) });

  const first = await repository.findPublicProperties({ limit: 2, offset: 0 });
  const second = await repository.findPublicProperties({ limit: 2, offset: 2 });

  assert.deepEqual(first.map((property) => property.id), ['12', '11']);
  assert.deepEqual(second.map((property) => property.id), ['10']);
  assert.deepEqual(query.mock.calls[0].arguments[1], [2, 0]);
  assert.deepEqual(query.mock.calls[1].arguments[1], [2, 2]);
  for (const call of query.mock.calls) {
    assert.match(normalize(call.arguments[0]), /ORDER BY p.published_at DESC NULLS LAST, p.id DESC LIMIT/);
  }
});

test('HU-010 repository usa limit=12 y offset=0 por omisión', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] }, { rows: [] });

  assert.deepEqual(await repository.findPublicProperties(), []);
  assert.deepEqual(await repository.findPublicProperties({}), []);
  for (const call of query.mock.calls) {
    assert.deepEqual(call.arguments[1], [12, 0]);
  }
});

test('HU-010 repository selecciona una sola foto principal con fallback y desempate estable', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [ROW] });

  const properties = await repository.findPublicProperties();

  assert.equal(properties.length, 1);
  assert.deepEqual(properties[0].primaryPhoto, PROPERTY.primaryPhoto);
  assert.match(normalize(query.mock.calls[0].arguments[0]), /LEFT JOIN LATERAL \( SELECT pp.id, pp.image_url FROM property_photos pp WHERE pp.property_id = p.id ORDER BY pp.is_primary DESC, pp.sort_order ASC, pp.id ASC LIMIT 1 \) photo ON TRUE/);
});

test('HU-010 repository no excluye un terreno sin foto y conserva construido nulo y precio cero', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [{
    ...ROW,
    property_type_id: '1',
    property_type_name: 'Terreno',
    publication_price: '0.00',
    has_construction: false,
    built_area_m2: null,
    primary_photo_id: null,
    primary_photo_url: null,
  }] });

  assert.deepEqual(await repository.findPublicProperties(), [{
    ...PROPERTY,
    propertyType: { id: 1, name: 'Terreno' },
    publicationPrice: 0,
    hasConstruction: false,
    builtArea: null,
    primaryPhoto: null,
  }]);
  const sql = normalize(query.mock.calls[0].arguments[0]);
  assert.match(sql, /LEFT JOIN LATERAL/);
  assert.doesNotMatch(sql, /photo\.id IS NOT NULL|pp\.is_primary = TRUE/);
});

test('HU-010 repository devuelve [] sin resultados o en una página fuera de rango', async (t) => {
  const { repository } = mockDatabase(t, { rows: [] });
  assert.deepEqual(await repository.findPublicProperties({ limit: 12, offset: 120 }), []);
});

for (const method of ['countPublicProperties', 'findPublicProperties']) {
  test(`HU-010 repository propaga los errores de ${method} sin ocultarlos`, async (t) => {
    const failure = new Error('fallo de consulta simulado');
    const { repository, query } = mockDatabase(t, failure);

    await assert.rejects(repository[method](), (error) => error === failure);
    assert.equal(query.mock.callCount(), 1);
  });
}
