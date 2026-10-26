const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');
const userRepository = require('../src/repositories/user.repository');
const { app } = require('../src/server');
const { updateProfileSchema } = require('../src/schemas/user.schema');

process.env.JWT_SECRET = 'terravalle-hu003-test-secret-2026-32chars';
process.env.JWT_EXPIRES_IN = '1h';

const OWNER = {
  id: '101',
  name: 'Usuario TerraValle',
  email: 'usuario@example.com',
  phone: '7731234567',
  contactEmail: null,
  isActive: true,
  createdAt: '2026-10-01T12:00:00.000Z',
};

// Perfil público que devuelve la API (sin isActive ni datos internos).
function profileOf(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    contactEmail: user.contactEmail ?? null,
    createdAt: user.createdAt ?? null,
  };
}
const OTHER_ID = '202';

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

function tokenFor(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function call(path, { method = 'GET', body, token } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// El middleware de autenticación busca al usuario del token.
function mockAuthenticatedUser(t, user = OWNER) {
  t.mock.method(userRepository, 'findById', async (id) => (id === user.id ? user : null));
}

test('HU-003 el esquema acepta campos permitidos y rechaza el resto', () => {
  assert.equal(updateProfileSchema.safeParse({ name: 'Nuevo nombre' }).success, true);
  assert.equal(updateProfileSchema.safeParse({ email: 'nuevo@example.com' }).success, true);
  assert.equal(updateProfileSchema.safeParse({}).success, false);
  assert.equal(updateProfileSchema.safeParse({ email: 'no-es-correo' }).success, false);
  assert.equal(updateProfileSchema.safeParse({ name: 'A' }).success, false);
  assert.equal(updateProfileSchema.safeParse({ isActive: false }).success, false);
  assert.equal(updateProfileSchema.safeParse({ passwordHash: 'x' }).success, false);
});

test('HU-003 CA1 el usuario autenticado consulta solo su perfil', async (t) => {
  mockAuthenticatedUser(t);

  const response = await call('/api/users/me', { token: tokenFor(OWNER) });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: profileOf(OWNER),
  });
});

test('HU-003 CA1 también puede consultar su perfil por su propio id', async (t) => {
  mockAuthenticatedUser(t);

  const response = await call(`/api/users/${OWNER.id}`, { token: tokenFor(OWNER) });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, OWNER.id);
});

test('HU-003 el perfil requiere sesión', async () => {
  const getResponse = await call('/api/users/me');
  const patchResponse = await call('/api/users/me', { method: 'PATCH', body: { name: 'Otro' } });

  assert.equal(getResponse.status, 401);
  assert.equal(patchResponse.status, 401);
});

test('HU-003 CA2 actualiza campos permitidos y devuelve la información vigente', async (t) => {
  mockAuthenticatedUser(t);
  t.mock.method(userRepository, 'isEmailTakenByOther', async () => false);
  const update = t.mock.method(userRepository, 'updateProfile', async (id, changes) => ({
    ...OWNER,
    ...changes,
    id,
  }));

  const response = await call('/api/users/me', {
    method: 'PATCH',
    token: tokenFor(OWNER),
    body: { name: '  Nombre Actualizado  ', email: ' NUEVO@EXAMPLE.COM ' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: 'Perfil actualizado correctamente.',
    user: profileOf({ ...OWNER, name: 'Nombre Actualizado', email: 'nuevo@example.com' }),
  });

  const [id, changes] = update.mock.calls[0].arguments;
  assert.equal(id, OWNER.id);
  assert.deepEqual(changes, { name: 'Nombre Actualizado', email: 'nuevo@example.com' });
});

test('HU-003 CA3 rechaza datos inválidos sin tocar la base de datos', async (t) => {
  mockAuthenticatedUser(t);
  const update = t.mock.method(userRepository, 'updateProfile', async () => {
    throw new Error('No debe actualizar con datos inválidos.');
  });

  const response = await call('/api/users/me', {
    method: 'PATCH',
    token: tokenFor(OWNER),
    body: { name: 'A', email: 'no-es-correo' },
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.message, 'Datos de perfil inválidos.');
  assert.deepEqual(body.errors.map((error) => error.field).sort(), ['email', 'name']);
  assert.equal(update.mock.callCount(), 0);
});

test('HU-003 CA3 no permite modificar campos protegidos', async (t) => {
  mockAuthenticatedUser(t);
  const update = t.mock.method(userRepository, 'updateProfile', async () => {
    throw new Error('No debe actualizar campos protegidos.');
  });

  const response = await call('/api/users/me', {
    method: 'PATCH',
    token: tokenFor(OWNER),
    body: { name: 'Nombre válido', isActive: false, passwordHash: 'x' },
  });

  assert.equal(response.status, 400);
  assert.equal(update.mock.callCount(), 0);
});

test('HU-003 CA3 rechaza un correo ya utilizado por otra cuenta', async (t) => {
  mockAuthenticatedUser(t);
  const emailCheck = t.mock.method(userRepository, 'isEmailTakenByOther', async () => true);
  const update = t.mock.method(userRepository, 'updateProfile', async () => {
    throw new Error('No debe actualizar con un correo duplicado.');
  });

  const response = await call('/api/users/me', {
    method: 'PATCH',
    token: tokenFor(OWNER),
    body: { email: 'ocupado@example.com' },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { message: 'El correo electrónico ya está registrado.' });
  assert.deepEqual(emailCheck.mock.calls[0].arguments, ['ocupado@example.com', OWNER.id]);
  assert.equal(update.mock.callCount(), 0);
});

test('HU-003 CA3 responde 409 si el índice único detecta el correo duplicado', async (t) => {
  mockAuthenticatedUser(t);
  t.mock.method(userRepository, 'isEmailTakenByOther', async () => false);
  t.mock.method(userRepository, 'updateProfile', async () => {
    const error = new Error('duplicate key value violates unique constraint "ux_users_email"');
    error.code = '23505';
    throw error;
  });

  const response = await call('/api/users/me', {
    method: 'PATCH',
    token: tokenFor(OWNER),
    body: { email: 'carrera@example.com' },
  });

  assert.equal(response.status, 409);
});

test('HU-003 CA4 deniega consultar o modificar otra cuenta', async (t) => {
  mockAuthenticatedUser(t);
  const update = t.mock.method(userRepository, 'updateProfile', async () => {
    throw new Error('No debe modificar otra cuenta.');
  });
  const token = tokenFor(OWNER);

  const getResponse = await call(`/api/users/${OTHER_ID}`, { token });
  const patchResponse = await call(`/api/users/${OTHER_ID}`, {
    method: 'PATCH',
    token,
    body: { name: 'Intruso' },
  });

  assert.equal(getResponse.status, 403);
  assert.equal(patchResponse.status, 403);
  assert.deepEqual(await patchResponse.json(), {
    message: 'No tienes permiso para acceder a otra cuenta.',
  });
  assert.equal(update.mock.callCount(), 0);
});

test('HU-019 el esquema valida teléfono y correo de contacto', () => {
  const parse = (data) => updateProfileSchema.safeParse(data);

  assert.equal(parse({ phone: '773 123 4567' }).success, true);
  assert.equal(parse({ phone: '+52 773-123-4567' }).success, true);
  assert.equal(parse({ phone: '12345' }).success, false);
  assert.equal(parse({ phone: 'abc1234567' }).success, false);
  assert.equal(parse({ contactEmail: 'ventas@example.com' }).success, true);
  assert.equal(parse({ contactEmail: 'no-es-correo' }).success, false);

  // Vacío significa "borrar el dato".
  assert.deepEqual(parse({ phone: '', contactEmail: '  ' }).data, { phone: null, contactEmail: null });
});

test('HU-019 actualiza los datos de contacto', async (t) => {
  mockAuthenticatedUser(t);
  const update = t.mock.method(userRepository, 'updateProfile', async (id, changes) => ({
    ...OWNER,
    ...changes,
    id,
  }));

  const response = await call('/api/users/me', {
    method: 'PATCH',
    token: tokenFor(OWNER),
    body: { phone: ' 773 765 4321 ', contactEmail: ' VENTAS@EXAMPLE.COM ' },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.phone, '773 765 4321');
  assert.equal(body.user.contactEmail, 'ventas@example.com');
  assert.deepEqual(update.mock.calls[0].arguments[1], {
    phone: '773 765 4321',
    contactEmail: 'ventas@example.com',
  });
});

test('HU-019 rechaza un teléfono inválido sin tocar la base de datos', async (t) => {
  mockAuthenticatedUser(t);
  const update = t.mock.method(userRepository, 'updateProfile', async () => {
    throw new Error('No debe actualizar con datos inválidos.');
  });

  const response = await call('/api/users/me', {
    method: 'PATCH',
    token: tokenFor(OWNER),
    body: { phone: '123' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).errors.map((error) => error.field), ['phone']);
  assert.equal(update.mock.callCount(), 0);
});
