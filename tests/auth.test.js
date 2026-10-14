const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../src/repositories/user.repository');
const { app } = require('../src/server');
const { connectDatabase } = require('../src/config/database');
const { loginSchema } = require('../src/schemas/auth.schema');

process.env.JWT_SECRET = 'terravalle-hu002-test-secret-2026-32chars';
process.env.JWT_EXPIRES_IN = '1h';

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

function request(path, options) {
  return fetch(`${baseUrl}${path}`, options);
}

function jsonRequest(path, body, method = 'POST', token) {
  return request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('HU-001 sigue exponiendo el endpoint de registro', async (t) => {
  const create = t.mock.method(userRepository, 'create', async (data) => ({
    id: '1',
    name: data.name,
    email: data.email,
    isActive: true,
  }));

  const response = await jsonRequest('/api/auth/register', {
    name: 'Usuario TerraValle',
    email: 'usuario@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 201);
  assert.equal(create.mock.callCount(), 1);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'name']);
});

test('HU-002 el esquema de login exige correo y contraseña', () => {
  assert.equal(loginSchema.safeParse({ email: 'usuario@example.com', password: 'clave' }).success, true);
  assert.equal(loginSchema.safeParse({ email: 'no-es-correo', password: 'clave' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'usuario@example.com' }).success, false);
});

test('HU-002 autentica credenciales correctas y devuelve JWT', async (t) => {
  const passwordHash = await bcrypt.hash('clave-segura', 12);
  const user = {
    id: '1',
    name: 'Usuario TerraValle',
    email: 'usuario@example.com',
    passwordHash,
    isActive: true,
  };

  t.mock.method(userRepository, 'findByEmailWithPassword', async () => user);

  const response = await jsonRequest('/api/auth/login', {
    email: ' USUARIO@EXAMPLE.COM ',
    password: 'clave-segura',
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message, 'Inicio de sesión correcto.');
  assert.equal(body.user.email, 'usuario@example.com');
  assert.equal(typeof body.token, 'string');

  const payload = jwt.verify(body.token, process.env.JWT_SECRET);
  assert.equal(payload.sub, user.id);
  assert.equal(payload.email, user.email);
});

test('HU-002 rechaza contraseña incorrecta con mensaje genérico', async (t) => {
  const passwordHash = await bcrypt.hash('clave-segura', 12);
  const user = { id: '2', name: 'Usuario', email: 'usuario@example.com', passwordHash, isActive: true };
  t.mock.method(userRepository, 'findByEmailWithPassword', async () => user);

  const response = await jsonRequest('/api/auth/login', {
    email: 'usuario@example.com',
    password: 'otra-clave',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Correo o contraseña incorrectos.' });
});

test('HU-002 rechaza correo inexistente con el mismo mensaje genérico', async (t) => {
  t.mock.method(userRepository, 'findByEmailWithPassword', async () => null);

  const response = await jsonRequest('/api/auth/login', {
    email: 'noexiste@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Correo o contraseña incorrectos.' });
});

test('HU-002 rechaza cuentas deshabilitadas sin revelar la causa', async (t) => {
  const passwordHash = await bcrypt.hash('clave-segura', 12);
  const user = { id: '3', name: 'Usuario', email: 'usuario@example.com', passwordHash, isActive: false };
  t.mock.method(userRepository, 'findByEmailWithPassword', async () => user);

  const response = await jsonRequest('/api/auth/login', {
    email: 'usuario@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Correo o contraseña incorrectos.' });
});

test('HU-002 acepta cuentas creadas antes del campo isActive', async (t) => {
  const passwordHash = await bcrypt.hash('clave-segura', 12);
  const user = { id: '4', name: 'Usuario', email: 'usuario@example.com', passwordHash };
  t.mock.method(userRepository, 'findByEmailWithPassword', async () => user);

  const response = await jsonRequest('/api/auth/login', {
    email: 'usuario@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 200);
});

test('HU-002 protege /api/auth/me con Bearer JWT', async (t) => {
  const user = { id: '5', name: 'Usuario', email: 'usuario@example.com', isActive: true };
  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  t.mock.method(userRepository, 'findById', async () => user);

  const response = await jsonRequest('/api/auth/me', undefined, 'GET', token);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: { id: user.id, name: user.name, email: user.email },
  });
});

test('HU-002 rechaza /api/auth/me sin token', async () => {
  const response = await request('/api/auth/me');
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Sesión no válida o expirada.' });
});

test('HU-002 rechaza /api/auth/me con token vencido', async (t) => {
  const token = jwt.sign({ sub: '6' }, process.env.JWT_SECRET, { expiresIn: -1 });
  t.mock.method(userRepository, 'findById', async () => {
    throw new Error('No debe consultar usuarios para un JWT vencido.');
  });

  const response = await jsonRequest('/api/auth/me', undefined, 'GET', token);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Sesión no válida o expirada.' });
});

test('el health check sigue disponible', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('las rutas inexistentes devuelven JSON 404', async () => {
  const response = await request('/no-existe');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: 'Ruta no encontrada.' });
});

test('la conexión exige DATABASE_URL si no se proporciona una cadena de conexión', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  await assert.rejects(connectDatabase(), /Configura DATABASE_URL/);
  if (previous !== undefined) process.env.DATABASE_URL = previous;
});
