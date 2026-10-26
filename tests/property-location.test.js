const assert = require('node:assert/strict');
const { test } = require('node:test');
const propertyRepository = require('../src/repositories/property.repository');
const {
  getLocation,
  saveLocation,
  getNearbyPlaceCategories,
  getNearbyPlaces,
  addNearbyPlace,
  removeNearbyPlace,
} = require('../src/controllers/property.controller');
const {
  saveLocationSchema,
  createNearbyPlaceSchema,
} = require('../src/schemas/property-location.schema');

const OWNER_ID = '101';
const PROPERTY = { id: '7', ownerId: OWNER_ID, title: 'Casa en Tula' };
const ADDRESS = {
  street: 'Avenida Hidalgo',
  exteriorNumber: '15',
  neighborhood: 'Centro',
  municipality: 'Tula de Allende',
  state: 'Hidalgo',
  postalCode: '42800',
};
const COORDINATES = { latitude: 20.053, longitude: -99.343 };
const CATEGORY = { id: 1, name: 'Escuela', isActive: true };
const NEARBY_PLACE = {
  categoryId: 1,
  name: 'Escuela primaria',
  approximateDistanceM: 250,
  ...COORDINATES,
};

const parseLocation = (body) => saveLocationSchema.safeParse(body);
const parsePlace = (body) => createNearbyPlaceSchema.safeParse(body);
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

function mockReq({ body, id = '7', placeId = '11', userId = OWNER_ID } = {}) {
  return { params: { id, placeId }, body, auth: { userId } };
}

function mockProperty(t, property = PROPERTY) {
  return t.mock.method(propertyRepository, 'findPropertyById', async (id) => (
    property && id === property.id ? property : null
  ));
}

// ---------------------------------------------------------------- Esquema: ubicación

test('HU-007 acepta una ubicación válida por dirección estructurada', () => {
  const result = parseLocation(ADDRESS);

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { ...ADDRESS, country: 'México' });
});

test('HU-007 acepta una ubicación válida solo por coordenadas y convierte texto numérico', () => {
  const result = parseLocation({ latitude: '20.053', longitude: '-99.343' });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { ...COORDINATES, country: 'México' });
});

test('HU-007 acepta una dirección formateada sin coordenadas ni dirección estructurada', () => {
  const result = parseLocation({ formattedAddress: '  Centro, Tula, Hidalgo  ' });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { formattedAddress: 'Centro, Tula, Hidalgo', country: 'México' });
});

test('HU-007 normaliza textos vacíos, coordenadas ausentes y país por omisión', () => {
  for (const empty of ['', null, undefined]) {
    const result = parseLocation({
      ...ADDRESS,
      street: '  Avenida Hidalgo  ',
      interiorNumber: '   ',
      country: '   ',
      latitude: empty,
      longitude: empty,
    });

    assert.equal(result.success, true);
    assert.equal(result.data.street, 'Avenida Hidalgo');
    assert.equal(result.data.interiorNumber, undefined);
    assert.equal(result.data.latitude, undefined);
    assert.equal(result.data.longitude, undefined);
    assert.equal(result.data.country, 'México');
  }
});

test('HU-007 rechaza latitudes fuera de rango', () => {
  for (const latitude of [-90.001, 90.001]) {
    const result = parseLocation({ ...COORDINATES, latitude });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['latitude']);
  }
});

test('HU-007 rechaza longitudes fuera de rango', () => {
  for (const longitude of [-180.001, 180.001]) {
    const result = parseLocation({ ...COORDINATES, longitude });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['longitude']);
  }
});

test('HU-007 rechaza solo latitud aunque exista una dirección válida', () => {
  const result = parseLocation({ ...ADDRESS, latitude: COORDINATES.latitude });

  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result), ['latitude', 'longitude']);
});

test('HU-007 rechaza solo longitud aunque exista una dirección válida', () => {
  const result = parseLocation({ ...ADDRESS, longitude: COORDINATES.longitude });

  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result), ['latitude', 'longitude']);
});

test('HU-007 rechaza una ubicación insuficiente o vacía', () => {
  for (const body of [{}, { street: 'Hidalgo' }, { municipality: 'Tula' }, { state: 'Hidalgo' }, {
    formattedAddress: '   ', latitude: '', longitude: null,
  }]) {
    const result = parseLocation(body);
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['formattedAddress']);
  }
});

test('HU-007 ambos esquemas rechazan campos desconocidos y cuerpos que no son objeto', () => {
  assert.equal(parseLocation({ ...ADDRESS, ownerId: '202' }).success, false);
  assert.equal(parsePlace({ ...NEARBY_PLACE, propertyId: '8' }).success, false);
  for (const body of [undefined, null, 'texto', []]) {
    assert.equal(parseLocation(body).success, false);
    assert.equal(parsePlace(body).success, false);
  }
});

test('HU-007 acepta coordenadas cero y los límites geográficos en ambos esquemas', () => {
  for (const coordinates of [
    { latitude: 0, longitude: 0 },
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
  ]) {
    assert.equal(parseLocation(coordinates).success, true);
    assert.equal(parsePlace({ ...NEARBY_PLACE, ...coordinates }).success, true);
  }
});

test('HU-007 rechaza texto no numérico y campos de dirección inválidos', () => {
  assert.equal(parseLocation({ latitude: 'norte', longitude: 'oeste' }).success, false);
  assert.equal(parseLocation({ ...ADDRESS, street: 'x'.repeat(151) }).success, false);
  assert.equal(parseLocation({ ...ADDRESS, country: 'M' }).success, false);
});

// ---------------------------------------------------------------- Esquema: puntos cercanos

test('HU-007 acepta un categoryId válido y normaliza los datos del punto cercano', () => {
  const result = parsePlace({
    categoryId: '1',
    name: '  Escuela primaria  ',
    approximateDistanceM: '250',
    latitude: '20.053',
    longitude: '-99.343',
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, NEARBY_PLACE);
});

test('HU-007 categoryId 32767 es válido estructuralmente (máximo SMALLINT)', () => {
  const result = parsePlace({ ...NEARBY_PLACE, categoryId: 32767 });

  assert.equal(result.success, true);
  assert.equal(result.data.categoryId, 32767);
});

for (const categoryId of [32768, 999999]) {
  test(`HU-007 el esquema rechaza categoryId ${categoryId} fuera de SMALLINT`, () => {
    const result = parsePlace({ ...NEARBY_PLACE, categoryId });

    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['categoryId']);
  });
}

test('HU-007 rechaza categorías no positivas, fraccionarias o no numéricas', () => {
  for (const categoryId of [0, -1, 1.5, 'escuela', undefined]) {
    const result = parsePlace({ ...NEARBY_PLACE, categoryId });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['categoryId']);
  }
});

test('HU-007 rechaza una distancia negativa o fraccionaria y acepta distancia cero', () => {
  for (const approximateDistanceM of [-1, 1.5, 'cerca']) {
    const result = parsePlace({ ...NEARBY_PLACE, approximateDistanceM });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['approximateDistanceM']);
  }
  assert.equal(parsePlace({ ...NEARBY_PLACE, approximateDistanceM: 0 }).success, true);
});

test('HU-007 rechaza coordenadas inválidas del punto cercano', () => {
  for (const coordinates of [
    { latitude: -90.001, longitude: -180.001 },
    { latitude: 90.001, longitude: 180.001 },
    { latitude: 'norte', longitude: 'oeste' },
  ]) {
    const result = parsePlace({ ...NEARBY_PLACE, ...coordinates });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['latitude', 'longitude']);
  }
});

test('HU-007 rechaza coordenadas incompletas del punto cercano en ambos sentidos', () => {
  for (const coordinates of [{ latitude: 20.053 }, { longitude: -99.343 }]) {
    const result = parsePlace({ categoryId: 1, name: 'Escuela primaria', ...coordinates });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['latitude', 'longitude']);
  }
});

test('HU-007 permite omitir distancia y coordenadas del punto cercano', () => {
  for (const empty of ['', null, undefined]) {
    const result = parsePlace({
      categoryId: 1,
      name: 'Escuela primaria',
      approximateDistanceM: empty,
      latitude: empty,
      longitude: empty,
    });
    assert.equal(result.success, true);
    assert.equal(result.data.approximateDistanceM, undefined);
    assert.equal(result.data.latitude, undefined);
    assert.equal(result.data.longitude, undefined);
  }
});

test('HU-007 el punto cercano exige un nombre de 2 a 150 caracteres', () => {
  for (const name of [undefined, '', '  ', 'A', 'x'.repeat(151)]) {
    const result = parsePlace({ ...NEARBY_PLACE, name });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsWithError(result), ['name']);
  }
});

// ---------------------------------------------------------------- Controlador: ubicación

test('HU-007 el propietario guarda su ubicación y recibe 200', async (t) => {
  mockProperty(t);
  const upsert = t.mock.method(propertyRepository, 'upsertLocation', async (propertyId, data) => ({
    id: '3', propertyId, ...data,
  }));
  const res = mockRes();

  await saveLocation(mockReq({ body: ADDRESS }), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Ubicación guardada correctamente.');
  assert.deepEqual(res.body.location, { id: '3', propertyId: '7', ...ADDRESS, country: 'México' });
  assert.equal(upsert.mock.callCount(), 1);
  assert.deepEqual(upsert.mock.calls[0].arguments, ['7', { ...ADDRESS, country: 'México' }]);
});

test('HU-007 el propietario consulta su ubicación y recibe 200', async (t) => {
  mockProperty(t);
  const location = { id: '3', propertyId: '7', ...ADDRESS, country: 'México' };
  const find = t.mock.method(propertyRepository, 'findLocationByPropertyId', async () => location);
  const res = mockRes();

  await getLocation(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { location });
  assert.deepEqual(find.mock.calls[0].arguments, ['7']);
});

test('HU-007 el propietario actualiza la ubicación de la misma propiedad y recibe 200', async (t) => {
  mockProperty(t);
  let saved = { id: '3', propertyId: '7', ...ADDRESS, country: 'México' };
  const upsert = t.mock.method(propertyRepository, 'upsertLocation', async (propertyId, data) => {
    saved = { id: saved.id, propertyId, ...data };
    return saved;
  });
  t.mock.method(propertyRepository, 'findLocationByPropertyId', async () => saved);
  const body = { ...ADDRESS, street: '  Avenida Juárez  ', exteriorNumber: '20', ...COORDINATES };
  const updated = { ...body, street: 'Avenida Juárez', country: 'México' };
  const res = mockRes();

  await saveLocation(mockReq({ body }), res, assert.fail);
  const found = mockRes();
  await getLocation(mockReq(), found, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(found.statusCode, 200);
  assert.deepEqual(upsert.mock.calls[0].arguments, ['7', updated]);
  assert.deepEqual(found.body.location, { id: '3', propertyId: '7', ...updated });
});

test('HU-007 consultar una propiedad sin ubicación devuelve 200 con null', async (t) => {
  mockProperty(t);
  t.mock.method(propertyRepository, 'findLocationByPropertyId', async () => null);
  const res = mockRes();

  await getLocation(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { location: null });
});

test('HU-007 una ubicación inválida devuelve 400 con detalle y no se guarda', async (t) => {
  mockProperty(t);
  const upsert = t.mock.method(propertyRepository, 'upsertLocation', assert.fail);
  const res = mockRes();

  await saveLocation(mockReq({ body: { latitude: 91, longitude: -181 } }), res, assert.fail);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'La ubicación proporcionada no es válida.');
  assert.deepEqual(res.body.errors.map((error) => error.field), ['latitude', 'longitude']);
  assert.ok(res.body.errors.every((error) => error.message.length > 0));
  assert.equal(upsert.mock.callCount(), 0);
});

// ---------------------------------------------------------------- Controlador: puntos cercanos

test('HU-007 consultar categorías devuelve 200 con el catálogo', async (t) => {
  const categories = [CATEGORY, { id: 2, name: 'Hospital', isActive: true }];
  const find = t.mock.method(propertyRepository, 'findNearbyPlaceCategories', async () => categories);
  const res = mockRes();

  await getNearbyPlaceCategories({}, res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { categories });
  assert.deepEqual(find.mock.calls[0].arguments, []);
});

test('HU-007 el propietario registra un punto cercano y recibe 201', async (t) => {
  mockProperty(t);
  const category = t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', async () => CATEGORY);
  const nearbyPlace = { id: '11', propertyId: '7', category: { id: 1, name: 'Escuela' }, name: NEARBY_PLACE.name };
  const create = t.mock.method(propertyRepository, 'createNearbyPlace', async () => nearbyPlace);
  const res = mockRes();

  await addNearbyPlace(mockReq({ body: { ...NEARBY_PLACE, categoryId: '1' } }), res, assert.fail);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { message: 'Punto cercano registrado correctamente.', nearbyPlace });
  assert.deepEqual(category.mock.calls[0].arguments, [1]);
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(create.mock.calls[0].arguments, [{ propertyId: '7', ...NEARBY_PLACE }]);
});

test('HU-007 una categoría inexistente dentro de SMALLINT devuelve 400 sin insertar', async (t) => {
  mockProperty(t);
  const category = t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', async () => null);
  const create = t.mock.method(propertyRepository, 'createNearbyPlace', assert.fail);
  const res = mockRes();

  await addNearbyPlace(mockReq({ body: { ...NEARBY_PLACE, categoryId: 32767 } }), res, assert.fail);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'La categoría seleccionada no existe o no está disponible.');
  assert.deepEqual(category.mock.calls[0].arguments, [32767]);
  assert.equal(create.mock.callCount(), 0);
});

test('HU-007 una categoría inactiva devuelve 400 sin insertar', async (t) => {
  mockProperty(t);
  t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', async () => ({ ...CATEGORY, isActive: false }));
  const create = t.mock.method(propertyRepository, 'createNearbyPlace', assert.fail);
  const res = mockRes();

  await addNearbyPlace(mockReq({ body: NEARBY_PLACE }), res, assert.fail);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'La categoría seleccionada no existe o no está disponible.');
  assert.equal(create.mock.callCount(), 0);
});

for (const categoryId of [32768, 999999]) {
  test(`HU-007 categoryId ${categoryId} devuelve 400 antes de consultar el repository de puntos`, async (t) => {
    const property = mockProperty(t);
    const category = t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', assert.fail);
    const create = t.mock.method(propertyRepository, 'createNearbyPlace', assert.fail);
    const res = mockRes();

    await addNearbyPlace(mockReq({ body: { ...NEARBY_PLACE, categoryId } }), res, assert.fail);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Los datos del punto cercano no son válidos.');
    assert.deepEqual(res.body.errors.map((error) => error.field), ['categoryId']);
    // La autorización de la propiedad ocurre antes de validar el cuerpo.
    assert.equal(property.mock.callCount(), 1);
    assert.equal(category.mock.callCount(), 0);
    assert.equal(create.mock.callCount(), 0);
  });
}

test('HU-007 datos inválidos del punto devuelven 400 con detalle y no consultan el catálogo', async (t) => {
  mockProperty(t);
  const category = t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', assert.fail);
  const create = t.mock.method(propertyRepository, 'createNearbyPlace', assert.fail);
  const res = mockRes();

  await addNearbyPlace(mockReq({ body: { ...NEARBY_PLACE, name: '', approximateDistanceM: -1 } }), res, assert.fail);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.errors.map((error) => error.field), ['name', 'approximateDistanceM']);
  assert.ok(res.body.errors.every((error) => error.message.length > 0));
  assert.equal(category.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('HU-007 el propietario consulta los puntos cercanos y recibe 200', async (t) => {
  mockProperty(t);
  const nearbyPlaces = [{ id: '11', propertyId: '7', ...NEARBY_PLACE }];
  const find = t.mock.method(propertyRepository, 'findNearbyPlacesByPropertyId', async () => nearbyPlaces);
  const res = mockRes();

  await getNearbyPlaces(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { nearbyPlaces });
  assert.deepEqual(find.mock.calls[0].arguments, ['7']);
});

test('HU-007 una propiedad sin puntos cercanos devuelve 200 con una lista vacía', async (t) => {
  mockProperty(t);
  t.mock.method(propertyRepository, 'findNearbyPlacesByPropertyId', async () => []);
  const res = mockRes();

  await getNearbyPlaces(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { nearbyPlaces: [] });
});

test('HU-007 el propietario elimina un punto y recibe 200', async (t) => {
  mockProperty(t);
  const remove = t.mock.method(propertyRepository, 'deleteNearbyPlace', async () => true);
  const res = mockRes();

  await removeNearbyPlace(mockReq(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Punto cercano eliminado correctamente.' });
  assert.deepEqual(remove.mock.calls[0].arguments, ['7', '11']);
});

test('HU-007 eliminar un punto inexistente devuelve 404', async (t) => {
  mockProperty(t);
  const remove = t.mock.method(propertyRepository, 'deleteNearbyPlace', async () => false);
  const res = mockRes();

  await removeNearbyPlace(mockReq({ placeId: '999' }), res, assert.fail);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: 'El punto cercano no fue encontrado.' });
  assert.deepEqual(remove.mock.calls[0].arguments, ['7', '999']);
});

// ---------------------------------------------------------------- Autorización y errores

const OWNED_OPERATIONS = [
  { label: 'guardar ubicación', controller: saveLocation, method: 'upsertLocation', body: ADDRESS },
  { label: 'consultar ubicación', controller: getLocation, method: 'findLocationByPropertyId', read: true },
  { label: 'consultar puntos', controller: getNearbyPlaces, method: 'findNearbyPlacesByPropertyId', read: true },
  { label: 'agregar un punto', controller: addNearbyPlace, method: 'createNearbyPlace', body: NEARBY_PLACE },
  { label: 'eliminar un punto', controller: removeNearbyPlace, method: 'deleteNearbyPlace' },
];

for (const { label, controller, method, body, read } of OWNED_OPERATIONS) {
  test(`HU-007 ${label} en una propiedad ajena devuelve 403 sin consultar ni modificar sus datos`, async (t) => {
    mockProperty(t);
    const operation = t.mock.method(propertyRepository, method, assert.fail);
    const category = t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', assert.fail);
    const res = mockRes();

    await controller(mockReq({ body, userId: '202' }), res, assert.fail);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, read
      ? 'No tienes permiso para consultar esta propiedad.'
      : 'No tienes permiso para modificar esta propiedad.');
    assert.equal(operation.mock.callCount(), 0);
    assert.equal(category.mock.callCount(), 0);
  });

  test(`HU-007 ${label} en una propiedad inexistente devuelve 404`, async (t) => {
    mockProperty(t, null);
    const operation = t.mock.method(propertyRepository, method, assert.fail);
    const category = t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', assert.fail);
    const res = mockRes();

    await controller(mockReq({ body, id: '999' }), res, assert.fail);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: 'Propiedad no encontrada.' });
    assert.equal(operation.mock.callCount(), 0);
    assert.equal(category.mock.callCount(), 0);
  });
}

for (const { label, controller, method, body } of [
  ...OWNED_OPERATIONS,
  { label: 'consultar categorías', controller: getNearbyPlaceCategories, method: 'findNearbyPlaceCategories' },
  { label: 'validar categoría', controller: addNearbyPlace, method: 'findNearbyPlaceCategoryById', body: NEARBY_PLACE },
]) {
  test(`HU-007 un error del repository al ${label} se delega a next(error)`, async (t) => {
    mockProperty(t);
    if (method === 'createNearbyPlace') {
      t.mock.method(propertyRepository, 'findNearbyPlaceCategoryById', async () => CATEGORY);
    }
    const failure = new Error('fallo del repository');
    t.mock.method(propertyRepository, method, async () => {
      throw failure;
    });
    const next = t.mock.fn();
    const res = mockRes();

    await controller(mockReq({ body }), res, next);

    assert.equal(next.mock.callCount(), 1);
    assert.deepEqual(next.mock.calls[0].arguments, [failure]);
    assert.equal(res.body, undefined);
  });
}
