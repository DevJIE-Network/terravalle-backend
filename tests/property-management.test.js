const assert = require('node:assert/strict');
const { test } = require('node:test');
const propertyRepository = require('../src/repositories/property.repository');
const {
  changePropertyStatus,
  getMyProperty,
  listMyProperties,
  updateProperty,
  withdrawProperty,
} = require('../src/controllers/property.controller');
const {
  changeStatusSchema,
  listPropertiesQuerySchema,
  toListOptions,
  toPropertyUpdate,
  toStatusChange,
  updatePropertySchema,
} = require('../src/schemas/property-management.schema');

const OWNER_ID = '101';
const OTHER_ID = '202';
const PROPERTY = {
  id: '7',
  ownerId: OWNER_ID,
  propertyTypeId: 2,
  title: 'Casa en Tula',
  description: null,
  publicationPrice: 1500000,
  status: 'active',
};

const parseUpdate = (body) => updatePropertySchema.safeParse(body);
const parseStatus = (body) => changeStatusSchema.safeParse(body);
const parseList = (query) => listPropertiesQuerySchema.safeParse(query);
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

function mockReq({ body, query = {}, id = '7', userId = OWNER_ID } = {}) {
  return { params: { id }, body, query, auth: { userId } };
}

function mockProperty(t, property = PROPERTY) {
  t.mock.method(propertyRepository, 'findPropertyById', async (id) => (
    property && id === property.id ? property : null
  ));
}

// ---------------------------------------------------------------- Esquema: edición

test('HU-008 CA2 acepta una edición parcial y solo devuelve los campos enviados', () => {
  const result = parseUpdate({ title: '  Casa amplia en Tula  ' });
  assert.equal(result.success, true);
  assert.deepEqual(toPropertyUpdate(result.data), { title: 'Casa amplia en Tula' });
});

test('HU-008 CA2 normaliza descripción y precio', () => {
  const result = parseUpdate({
    propertyTypeId: '3',
    description: '',
    publicationPrice: '1250000.50',
  });
  assert.equal(result.success, true);
  assert.deepEqual(toPropertyUpdate(result.data), {
    propertyTypeId: 3,
    description: null,
    publicationPrice: 1250000.5,
  });
});

test('HU-008 CA2 permite quitar el precio con null o texto vacío', () => {
  for (const value of [null, '']) {
    const result = parseUpdate({ publicationPrice: value });
    assert.equal(result.success, true);
    assert.deepEqual(toPropertyUpdate(result.data), { publicationPrice: null });
  }
});

test('HU-008 rechaza una edición vacía', () => {
  const result = parseUpdate({});
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].message, 'Envía al menos un campo para actualizar.');
});

test('HU-008 CA4 no permite cambiar propietario, estado ni otros campos', () => {
  assert.equal(parseUpdate({ title: 'Casa en Tula', ownerId: '202' }).success, false);
  assert.equal(parseUpdate({ title: 'Casa en Tula', status: 'active' }).success, false);
  assert.equal(parseUpdate({ id: '9' }).success, false);
});

test('HU-008 rechaza valores inválidos al editar', () => {
  const result = parseUpdate({
    title: 'ab',
    propertyTypeId: 0,
    description: 'x'.repeat(3001),
    publicationPrice: -5,
  });
  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result).sort(), [
    'description',
    'propertyTypeId',
    'publicationPrice',
    'title',
  ]);

  assert.equal(parseUpdate({ title: 'x'.repeat(151) }).success, false);
  assert.equal(parseUpdate({ title: 123 }).success, false);
  assert.equal(parseUpdate({ propertyTypeId: 'abc' }).success, false);
  assert.equal(parseUpdate({ publicationPrice: 'caro' }).success, false);
  assert.equal(parseUpdate({ publicationPrice: 100.123 }).success, false);
  assert.equal(parseUpdate({ publicationPrice: 1e15 }).success, false);
});

// ---------------------------------------------------------------- Esquema: estado

test('HU-008 CA3 acepta activar o desactivar, con motivo opcional', () => {
  const inactive = parseStatus({ status: 'inactive', reason: '  Vacaciones  ' });
  assert.equal(inactive.success, true);
  assert.deepEqual(toStatusChange(inactive.data), { status: 'inactive', reason: 'Vacaciones' });

  const active = parseStatus({ status: 'active' });
  assert.equal(active.success, true);
  assert.deepEqual(toStatusChange(active.data), { status: 'active', reason: null });
});

test('HU-008 el estado withdrawn y draft no se asignan por PATCH', () => {
  const withdrawn = parseStatus({ status: 'withdrawn' });
  assert.equal(withdrawn.success, false);
  assert.match(withdrawn.error.issues[0].message, /DELETE/);

  assert.equal(parseStatus({ status: 'draft' }).success, false);
  assert.equal(parseStatus({ status: 'otro' }).success, false);
  assert.equal(parseStatus({}).success, false);
  assert.equal(parseStatus({ status: 'active', reason: 'x'.repeat(256) }).success, false);
  assert.equal(parseStatus({ status: 'active', ownerId: '9' }).success, false);
});

// ---------------------------------------------------------------- Esquema: listado

test('HU-008 el listado usa valores por omisión y acepta filtros', () => {
  const defaults = parseList({});
  assert.equal(defaults.success, true);
  assert.deepEqual(toListOptions(defaults.data), { status: null, page: 1, limit: 20 });

  const filtered = parseList({ status: 'inactive', page: '2', limit: '5', _: '12345' });
  assert.equal(filtered.success, true);
  assert.deepEqual(toListOptions(filtered.data), { status: 'inactive', page: 2, limit: 5 });
});

test('HU-008 el listado rechaza filtros inválidos', () => {
  const result = parseList({ status: 'borrado', page: '0', limit: '500' });
  assert.equal(result.success, false);
  assert.deepEqual(fieldsWithError(result).sort(), ['limit', 'page', 'status']);

  assert.equal(parseList({ page: '1.5' }).success, false);
  assert.equal(parseList({ status: ['active', 'inactive'] }).success, false);
});

// ---------------------------------------------------------------- Controlador: listado

test('HU-008 CA1 el listado consulta solo las propiedades del usuario autenticado', async (t) => {
  const mine = [{ ...PROPERTY }, { ...PROPERTY, id: '8', status: 'withdrawn' }];
  const find = t.mock.method(propertyRepository, 'findPropertiesByOwnerId', async () => mine);
  const count = t.mock.method(propertyRepository, 'countPropertiesByOwnerId', async () => 42);
  const res = mockRes();

  await listMyProperties(mockReq({ query: { page: '2', limit: '20' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.properties, mine);
  assert.deepEqual(res.body.pagination, { page: 2, limit: 20, total: 42, totalPages: 3 });
  assert.equal(find.mock.calls[0].arguments[0], OWNER_ID);
  assert.deepEqual(find.mock.calls[0].arguments[1], { status: null, limit: 20, offset: 20 });
  assert.deepEqual(count.mock.calls[0].arguments, [OWNER_ID, null]);
});

test('HU-008 CA1 el listado acepta el filtro por estado', async (t) => {
  const find = t.mock.method(propertyRepository, 'findPropertiesByOwnerId', async () => []);
  const count = t.mock.method(propertyRepository, 'countPropertiesByOwnerId', async () => 0);
  const res = mockRes();

  await listMyProperties(mockReq({ query: { status: 'inactive' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pagination.totalPages, 0);
  assert.equal(find.mock.calls[0].arguments[1].status, 'inactive');
  assert.equal(count.mock.calls[0].arguments[1], 'inactive');
});

test('HU-008 un filtro inválido devuelve 400 y no consulta la base', async (t) => {
  const find = t.mock.method(propertyRepository, 'findPropertiesByOwnerId', async () => []);
  const res = mockRes();

  await listMyProperties(mockReq({ query: { limit: '0' } }), res, () => {});

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.some((error) => error.field === 'limit'));
  assert.equal(find.mock.callCount(), 0);
});

test('HU-008 un error de base de datos en el listado se delega al manejador global', async (t) => {
  const failure = new Error('fallo de base de datos');
  t.mock.method(propertyRepository, 'countPropertiesByOwnerId', async () => {
    throw failure;
  });
  t.mock.method(propertyRepository, 'findPropertiesByOwnerId', async () => []);
  const next = t.mock.fn();

  await listMyProperties(mockReq(), mockRes(), next);

  assert.equal(next.mock.calls[0].arguments[0], failure);
});

// ---------------------------------------------------------------- Controlador: detalle

test('HU-008 el dueño consulta el detalle de su propiedad', async (t) => {
  mockProperty(t);
  const res = mockRes();

  await getMyProperty(mockReq(), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.property, PROPERTY);
});

test('HU-008 CA4 consultar el detalle de otro vendedor devuelve 403, y de una inexistente 404', async (t) => {
  mockProperty(t, { ...PROPERTY, ownerId: OTHER_ID });
  const forbidden = mockRes();
  await getMyProperty(mockReq(), forbidden, () => {});
  assert.equal(forbidden.statusCode, 403);

  const missing = mockRes();
  await getMyProperty(mockReq({ id: '999' }), missing, () => {});
  assert.equal(missing.statusCode, 404);
});

// ---------------------------------------------------------------- Controlador: edición

test('HU-008 CA2 el dueño edita su propiedad y solo se envían los campos permitidos', async (t) => {
  mockProperty(t);
  const update = t.mock.method(propertyRepository, 'updateProperty', async (id, ownerId, fields) => ({
    ...PROPERTY,
    ...fields,
  }));
  const res = mockRes();

  await updateProperty(mockReq({ body: { title: 'Casa renovada', publicationPrice: '1600000' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.property.title, 'Casa renovada');
  assert.equal(res.body.property.ownerId, OWNER_ID);
  assert.deepEqual(update.mock.calls[0].arguments, [
    '7',
    OWNER_ID,
    { title: 'Casa renovada', publicationPrice: 1600000 },
  ]);
});

test('HU-008 al cambiar el tipo de propiedad se valida que exista y esté activo', async (t) => {
  mockProperty(t);
  const update = t.mock.method(propertyRepository, 'updateProperty', async () => PROPERTY);

  t.mock.method(propertyRepository, 'findPropertyTypeById', async () => null);
  const invalid = mockRes();
  await updateProperty(mockReq({ body: { propertyTypeId: 99 } }), invalid, () => {});
  assert.equal(invalid.statusCode, 400);

  t.mock.method(propertyRepository, 'findPropertyTypeById', async () => ({ id: 3, isActive: false }));
  const inactive = mockRes();
  await updateProperty(mockReq({ body: { propertyTypeId: 3 } }), inactive, () => {});
  assert.equal(inactive.statusCode, 400);
  assert.equal(update.mock.callCount(), 0);

  t.mock.method(propertyRepository, 'findPropertyTypeById', async () => ({ id: 3, isActive: true }));
  const valid = mockRes();
  await updateProperty(mockReq({ body: { propertyTypeId: 3 } }), valid, () => {});
  assert.equal(valid.statusCode, 200);
  assert.equal(update.mock.callCount(), 1);
});

test('HU-008 los datos inválidos al editar devuelven 400 y no se guardan', async (t) => {
  mockProperty(t);
  const update = t.mock.method(propertyRepository, 'updateProperty', async () => PROPERTY);
  const res = mockRes();

  await updateProperty(mockReq({ body: { title: 'a', ownerId: '202' } }), res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(update.mock.callCount(), 0);
});

test('HU-008 una propiedad retirada no se puede editar (409)', async (t) => {
  mockProperty(t, { ...PROPERTY, status: 'withdrawn' });
  const update = t.mock.method(propertyRepository, 'updateProperty', async () => PROPERTY);
  const res = mockRes();

  await updateProperty(mockReq({ body: { title: 'Nuevo título' } }), res, () => {});

  assert.equal(res.statusCode, 409);
  assert.equal(update.mock.callCount(), 0);
});

test('HU-008 si la propiedad cambió durante la edición devuelve 409', async (t) => {
  mockProperty(t);
  t.mock.method(propertyRepository, 'updateProperty', async () => null);
  const res = mockRes();

  await updateProperty(mockReq({ body: { title: 'Nuevo título' } }), res, () => {});

  assert.equal(res.statusCode, 409);
});

// ---------------------------------------------------------------- Controlador: estado

test('HU-008 CA3 desactivar una propiedad activa la saca del catálogo y registra el cambio', async (t) => {
  mockProperty(t, { ...PROPERTY, status: 'active' });
  const change = t.mock.method(propertyRepository, 'changePropertyStatus', async ({ newStatus }) => ({
    ...PROPERTY,
    status: newStatus,
  }));
  const res = mockRes();

  await changePropertyStatus(mockReq({ body: { status: 'inactive', reason: 'Pausa' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.property.status, 'inactive');
  assert.deepEqual(change.mock.calls[0].arguments[0], {
    propertyId: '7',
    ownerId: OWNER_ID,
    previousStatus: 'active',
    newStatus: 'inactive',
    reason: 'Pausa',
  });
});

test('HU-008 se puede publicar un borrador y reactivar una propiedad inactiva', async (t) => {
  const change = t.mock.method(propertyRepository, 'changePropertyStatus', async ({ newStatus }) => ({
    ...PROPERTY,
    status: newStatus,
  }));

  for (const previous of ['draft', 'inactive']) {
    mockProperty(t, { ...PROPERTY, status: previous });
    const res = mockRes();
    await changePropertyStatus(mockReq({ body: { status: 'active' } }), res, () => {});
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.property.status, 'active');
  }

  assert.equal(change.mock.callCount(), 2);
});

test('HU-008 los cambios de estado no permitidos devuelven 409', async (t) => {
  const change = t.mock.method(propertyRepository, 'changePropertyStatus', async () => PROPERTY);

  const cases = [
    { current: 'draft', next: 'inactive' }, // un borrador primero se publica
    { current: 'active', next: 'active' }, // ya está en ese estado
    { current: 'inactive', next: 'inactive' },
    { current: 'withdrawn', next: 'active' }, // el retiro es definitivo
  ];

  for (const { current, next } of cases) {
    mockProperty(t, { ...PROPERTY, status: current });
    const res = mockRes();
    await changePropertyStatus(mockReq({ body: { status: next } }), res, () => {});
    assert.equal(res.statusCode, 409, `${current} -> ${next}`);
  }

  assert.equal(change.mock.callCount(), 0);
});

test('HU-008 un estado inválido devuelve 400 y no cambia nada', async (t) => {
  mockProperty(t);
  const change = t.mock.method(propertyRepository, 'changePropertyStatus', async () => PROPERTY);
  const res = mockRes();

  await changePropertyStatus(mockReq({ body: { status: 'withdrawn' } }), res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(change.mock.callCount(), 0);
});

test('HU-008 si el estado cambió durante la operación devuelve 409', async (t) => {
  mockProperty(t);
  t.mock.method(propertyRepository, 'changePropertyStatus', async () => null);
  const res = mockRes();

  await changePropertyStatus(mockReq({ body: { status: 'inactive' } }), res, () => {});

  assert.equal(res.statusCode, 409);
});

// ---------------------------------------------------------------- Controlador: retiro

test('HU-008 retirar una propiedad conserva la información (retiro lógico)', async (t) => {
  mockProperty(t, { ...PROPERTY, status: 'inactive' });
  const change = t.mock.method(propertyRepository, 'changePropertyStatus', async ({ newStatus }) => ({
    ...PROPERTY,
    status: newStatus,
    withdrawnAt: '2026-10-22T00:00:00.000Z',
  }));
  const res = mockRes();

  await withdrawProperty(mockReq(), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.property.status, 'withdrawn');
  assert.equal(res.body.property.title, PROPERTY.title);
  assert.deepEqual(change.mock.calls[0].arguments[0], {
    propertyId: '7',
    ownerId: OWNER_ID,
    previousStatus: 'inactive',
    newStatus: 'withdrawn',
    reason: 'Retirada por el propietario',
  });
});

test('HU-008 retirar una propiedad ya retirada devuelve 409', async (t) => {
  mockProperty(t, { ...PROPERTY, status: 'withdrawn' });
  const change = t.mock.method(propertyRepository, 'changePropertyStatus', async () => PROPERTY);
  const res = mockRes();

  await withdrawProperty(mockReq(), res, () => {});

  assert.equal(res.statusCode, 409);
  assert.equal(change.mock.callCount(), 0);
});

// ---------------------------------------------------------------- Propiedad ajena / inexistente

test('HU-008 CA4 editar, cambiar estado o retirar una propiedad ajena devuelve 403 y no modifica nada', async (t) => {
  mockProperty(t, { ...PROPERTY, ownerId: OTHER_ID });
  const update = t.mock.method(propertyRepository, 'updateProperty', async () => PROPERTY);
  const change = t.mock.method(propertyRepository, 'changePropertyStatus', async () => PROPERTY);

  const edit = mockRes();
  await updateProperty(mockReq({ body: { title: 'Intento ajeno' } }), edit, () => {});
  const status = mockRes();
  await changePropertyStatus(mockReq({ body: { status: 'inactive' } }), status, () => {});
  const withdraw = mockRes();
  await withdrawProperty(mockReq(), withdraw, () => {});

  assert.equal(edit.statusCode, 403);
  assert.equal(status.statusCode, 403);
  assert.equal(withdraw.statusCode, 403);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(change.mock.callCount(), 0);
});

test('HU-008 operar sobre una propiedad inexistente devuelve 404', async (t) => {
  mockProperty(t, null);

  const edit = mockRes();
  await updateProperty(mockReq({ body: { title: 'Casa nueva' }, id: '999' }), edit, () => {});
  const status = mockRes();
  await changePropertyStatus(mockReq({ body: { status: 'active' }, id: '999' }), status, () => {});
  const withdraw = mockRes();
  await withdrawProperty(mockReq({ id: '999' }), withdraw, () => {});

  assert.equal(edit.statusCode, 404);
  assert.equal(status.statusCode, 404);
  assert.equal(withdraw.statusCode, 404);
});

test('HU-008 un error de base de datos se delega al manejador global', async (t) => {
  mockProperty(t);
  const failure = new Error('fallo de base de datos');
  t.mock.method(propertyRepository, 'changePropertyStatus', async () => {
    throw failure;
  });
  const next = t.mock.fn();

  await withdrawProperty(mockReq(), mockRes(), next);

  assert.equal(next.mock.calls[0].arguments[0], failure);
});
