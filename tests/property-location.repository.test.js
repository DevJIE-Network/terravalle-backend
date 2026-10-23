const assert = require('node:assert/strict');
const { test } = require('node:test');
const database = require('../src/config/database');

const LOCATION_ROW = {
  id: '9007199254740993',
  property_id: '7',
  street: 'Avenida Hidalgo',
  exterior_number: '15',
  interior_number: '2',
  neighborhood: 'Centro',
  municipality: 'Tula de Allende',
  state: 'Hidalgo',
  postal_code: '42800',
  country: 'México',
  latitude: '20.053000',
  longitude: '-99.343000',
  formatted_address: 'Avenida Hidalgo 15, Centro, Tula de Allende, Hidalgo',
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-02T12:00:00.000Z',
};
const LOCATION = {
  id: '9007199254740993',
  propertyId: '7',
  street: 'Avenida Hidalgo',
  exteriorNumber: '15',
  interiorNumber: '2',
  neighborhood: 'Centro',
  municipality: 'Tula de Allende',
  state: 'Hidalgo',
  postalCode: '42800',
  country: 'México',
  latitude: 20.053,
  longitude: -99.343,
  formattedAddress: 'Avenida Hidalgo 15, Centro, Tula de Allende, Hidalgo',
  createdAt: LOCATION_ROW.created_at,
  updatedAt: LOCATION_ROW.updated_at,
};
const PLACE_ROW = {
  id: '9007199254740995',
  property_id: '7',
  category_id: '1',
  category_name: 'Escuela',
  name: "Escuela O'Brien",
  approximate_distance_m: '250',
  latitude: '20.054000',
  longitude: '-99.344000',
  provider: 'manual',
  provider_place_id: null,
  last_checked_at: null,
  created_at: '2026-10-01T12:00:00.000Z',
};
const PLACE = {
  id: '9007199254740995',
  propertyId: '7',
  category: { id: 1, name: 'Escuela' },
  name: "Escuela O'Brien",
  approximateDistanceM: 250,
  latitude: 20.054,
  longitude: -99.344,
  provider: 'manual',
  providerPlaceId: null,
  lastCheckedAt: null,
  createdAt: PLACE_ROW.created_at,
};

// El repository captura query al importarse: se carga después del mock de cada prueba.
// No se crea ningún pool ni conexión a PostgreSQL; t.mock restaura query al terminar.
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
  t.after(() => {
    delete require.cache[repositoryPath];
  });
  return { repository, query };
}

// ---------------------------------------------------------------- Ubicación

test('HU-007 repository consulta la ubicación por propiedad y convierte los tipos de PostgreSQL', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [LOCATION_ROW] });

  assert.deepEqual(await repository.findLocationByPropertyId('7'), LOCATION);
  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /FROM property_locations\s+WHERE property_id = \$1\s+LIMIT 1/);
  assert.deepEqual(params, ['7']);
});

test('HU-007 repository devuelve null si la propiedad no tiene ubicación', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] });

  assert.equal(await repository.findLocationByPropertyId('7'), null);
  assert.equal(query.mock.callCount(), 1);
});

test('HU-007 repository no consulta ubicaciones con identificadores inválidos', async (t) => {
  const { repository, query } = mockDatabase(t);

  for (const id of [undefined, null, '', 'abc', '7 OR 1=1', '01', '0', '-1', '1'.repeat(20)]) {
    assert.equal(await repository.findLocationByPropertyId(id), null);
  }
  assert.equal(query.mock.callCount(), 0);
});

test('HU-007 repository conserva coordenadas nulas en una ubicación por dirección', async (t) => {
  const { repository } = mockDatabase(t, {
    rows: [{ ...LOCATION_ROW, latitude: null, longitude: null }],
  });

  assert.deepEqual(await repository.findLocationByPropertyId('7'), {
    ...LOCATION, latitude: null, longitude: null,
  });
});

test('HU-007 repository guarda o actualiza todos los campos de ubicación con parámetros', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [LOCATION_ROW] });
  const { id, propertyId, createdAt, updatedAt, ...data } = LOCATION;

  assert.deepEqual(await repository.upsertLocation('7', data), LOCATION);
  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO property_locations/);
  assert.match(sql, /ON CONFLICT \(property_id\)\s+DO UPDATE SET/);
  assert.match(sql, /formatted_address =\s+EXCLUDED.formatted_address/);
  assert.deepEqual(params, [
    '7', 'Avenida Hidalgo', '15', '2', 'Centro', 'Tula de Allende', 'Hidalgo',
    '42800', 'México', 20.053, -99.343,
    'Avenida Hidalgo 15, Centro, Tula de Allende, Hidalgo',
  ]);
});

test('HU-007 repository usa null y México por omisión sin perder coordenadas cero', async (t) => {
  const { repository, query } = mockDatabase(t, {
    rows: [{ ...LOCATION_ROW, latitude: '0', longitude: '0' }],
  });

  const saved = await repository.upsertLocation('7', { latitude: 0, longitude: 0 });

  assert.equal(saved.latitude, 0);
  assert.equal(saved.longitude, 0);
  assert.deepEqual(query.mock.calls[0].arguments[1], [
    '7', null, null, null, null, null, null, null, 'México', 0, 0, null,
  ]);
});

test('HU-007 repository guarda una dirección sin coordenadas como null', async (t) => {
  const { repository, query } = mockDatabase(t, {
    rows: [{ ...LOCATION_ROW, latitude: null, longitude: null }],
  });

  const saved = await repository.upsertLocation('7', { formattedAddress: LOCATION.formattedAddress });

  assert.equal(saved.latitude, null);
  assert.equal(saved.longitude, null);
  assert.deepEqual(query.mock.calls[0].arguments[1], [
    '7', null, null, null, null, null, null, null, 'México', null, null, LOCATION.formattedAddress,
  ]);
});

// ---------------------------------------------------------------- Categorías

test('HU-007 repository consulta solo categorías activas ordenadas por nombre', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [
    { id: '1', name: 'Escuela', is_active: true },
    { id: '2', name: 'Hospital', is_active: true },
  ] });

  assert.deepEqual(await repository.findNearbyPlaceCategories(), [
    { id: 1, name: 'Escuela', isActive: true },
    { id: 2, name: 'Hospital', isActive: true },
  ]);
  assert.equal(query.mock.callCount(), 1);
  assert.match(query.mock.calls[0].arguments[0], /WHERE is_active = TRUE\s+ORDER BY name ASC/);
});

test('HU-007 repository devuelve una lista vacía si no hay categorías activas', async (t) => {
  const { repository } = mockDatabase(t, { rows: [] });

  assert.deepEqual(await repository.findNearbyPlaceCategories(), []);
});

test('HU-007 repository consulta una categoría por id y conserva su estado activo o inactivo', async (t) => {
  const { repository, query } = mockDatabase(t,
    { rows: [{ id: '1', name: 'Escuela', is_active: true }] },
    { rows: [{ id: '2', name: 'Hospital', is_active: false }] });

  assert.deepEqual(await repository.findNearbyPlaceCategoryById(1), { id: 1, name: 'Escuela', isActive: true });
  assert.deepEqual(await repository.findNearbyPlaceCategoryById(2), { id: 2, name: 'Hospital', isActive: false });
  assert.equal(query.mock.callCount(), 2);
  assert.match(query.mock.calls[0].arguments[0], /WHERE id = \$1\s+LIMIT 1/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [1]);
  assert.deepEqual(query.mock.calls[1].arguments[1], [2]);
});

test('HU-007 repository devuelve null para una categoría inexistente dentro de SMALLINT', async (t) => {
  const { repository, query } = mockDatabase(t, { rows: [] });

  assert.equal(await repository.findNearbyPlaceCategoryById(32767), null);
  assert.deepEqual(query.mock.calls[0].arguments[1], [32767]);
});

// ---------------------------------------------------------------- Puntos cercanos

test('HU-007 repository lista puntos solo de la propiedad y normaliza números y nulos', async (t) => {
  const nullableRow = {
    ...PLACE_ROW,
    id: '12',
    approximate_distance_m: null,
    latitude: null,
    longitude: null,
    provider: 'externo',
    provider_place_id: 'external-12',
    last_checked_at: '2026-10-02T12:00:00.000Z',
  };
  const { repository, query } = mockDatabase(t, { rows: [PLACE_ROW, nullableRow] });

  assert.deepEqual(await repository.findNearbyPlacesByPropertyId('7'), [PLACE, {
    ...PLACE,
    id: '12',
    approximateDistanceM: null,
    latitude: null,
    longitude: null,
    provider: 'externo',
    providerPlaceId: 'external-12',
    lastCheckedAt: nullableRow.last_checked_at,
  }]);
  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /INNER JOIN nearby_place_categories npc\s+ON npc.id = np.category_id/);
  assert.match(sql, /WHERE np.property_id = \$1/);
  assert.match(sql, /ORDER BY\s+np.approximate_distance_m\s+NULLS LAST,\s+np.name ASC/);
  assert.deepEqual(params, ['7']);
});

test('HU-007 repository devuelve una lista vacía si la propiedad no tiene puntos', async (t) => {
  const { repository } = mockDatabase(t, { rows: [] });

  assert.deepEqual(await repository.findNearbyPlacesByPropertyId('7'), []);
});

test('HU-007 repository crea un punto con parámetros y consulta la categoría del registro creado', async (t) => {
  const { repository, query } = mockDatabase(t,
    { rows: [{ id: PLACE_ROW.id }] },
    { rows: [PLACE_ROW] });

  const created = await repository.createNearbyPlace({
    propertyId: '7', categoryId: 1, name: PLACE.name,
    approximateDistanceM: 250, latitude: 20.054, longitude: -99.344,
  });

  assert.deepEqual(created, PLACE);
  assert.equal(query.mock.callCount(), 2);
  const [insertSql, insertParams] = query.mock.calls[0].arguments;
  assert.match(insertSql, /INSERT INTO nearby_places/);
  assert.match(insertSql, /RETURNING id/);
  assert.equal(insertSql.includes(PLACE.name), false);
  assert.deepEqual(insertParams, ['7', 1, PLACE.name, 250, 20.054, -99.344]);
  const [selectSql, selectParams] = query.mock.calls[1].arguments;
  assert.match(selectSql, /INNER JOIN nearby_place_categories/);
  assert.match(selectSql, /WHERE np.id = \$1\s+LIMIT 1/);
  assert.deepEqual(selectParams, [PLACE_ROW.id]);
});

test('HU-007 repository crea puntos sin distancia ni coordenadas usando null', async (t) => {
  const { repository, query } = mockDatabase(t,
    { rows: [{ id: PLACE_ROW.id }] },
    { rows: [{ ...PLACE_ROW, approximate_distance_m: null, latitude: null, longitude: null }] });

  assert.deepEqual(await repository.createNearbyPlace({ propertyId: '7', categoryId: 1, name: PLACE.name }), {
    ...PLACE, approximateDistanceM: null, latitude: null, longitude: null,
  });
  assert.equal(query.mock.callCount(), 2);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['7', 1, PLACE.name, null, null, null]);
});

test('HU-007 repository conserva distancia y coordenadas cero al crear un punto', async (t) => {
  const { repository, query } = mockDatabase(t,
    { rows: [{ id: PLACE_ROW.id }] },
    { rows: [{ ...PLACE_ROW, approximate_distance_m: '0', latitude: '0', longitude: '0' }] });

  assert.deepEqual(await repository.createNearbyPlace({
    propertyId: '7', categoryId: 1, name: PLACE.name,
    approximateDistanceM: 0, latitude: 0, longitude: 0,
  }), { ...PLACE, approximateDistanceM: 0, latitude: 0, longitude: 0 });
  assert.deepEqual(query.mock.calls[0].arguments[1], ['7', 1, PLACE.name, 0, 0, 0]);
});

test('HU-007 repository elimina el punto solo si pertenece a la propiedad indicada', async (t) => {
  const { repository, query } = mockDatabase(t, { rowCount: 1 });

  assert.equal(await repository.deleteNearbyPlace('7', '11'), true);
  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /DELETE FROM nearby_places\s+WHERE id = \$1\s+AND property_id = \$2/);
  assert.deepEqual(params, ['11', '7']);
});

test('HU-007 repository devuelve false si el punto no existe o pertenece a otra propiedad', async (t) => {
  const { repository, query } = mockDatabase(t, { rowCount: 0 });

  assert.equal(await repository.deleteNearbyPlace('7', '999'), false);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['999', '7']);
});

test('HU-007 repository rechaza identificadores inválidos al eliminar sin consultar PostgreSQL', async (t) => {
  const { repository, query } = mockDatabase(t);

  for (const [propertyId, placeId] of [
    ['0', '11'], ['7', '0'], ['abc', '11'], ['7', 'abc'],
    [undefined, '11'], ['7', undefined], ['7', '1'.repeat(20)],
  ]) {
    assert.equal(await repository.deleteNearbyPlace(propertyId, placeId), false);
  }
  assert.equal(query.mock.callCount(), 0);
});

test('HU-007 repository propaga errores de consulta sin ocultarlos', async (t) => {
  const failure = new Error('fallo de consulta simulado');
  const { repository, query } = mockDatabase(t, failure);

  await assert.rejects(repository.findLocationByPropertyId('7'), (error) => error === failure);
  assert.equal(query.mock.callCount(), 1);
});
