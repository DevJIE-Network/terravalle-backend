const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
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

process.on('exit', () => {
  if (server) server.close();
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
  const create = t.mock.method(User, 'create', async (data) => new User(data));

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
    id: '68f000000000000000000001',
    name: 'Usuario TerraValle',
    email: 'usuario@example.com',
    passwordHash,
    isActive: true,
  };

  t.mock.method(User, 'findOne', () => ({ select: async () => user }));

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
  const user = { id: '68f000000000000000000002', name: 'Usuario', email: 'usuario@example.com', passwordHash, isActive: true };
  t.mock.method(User, 'findOne', () => ({ select: async () => user }));

  const response = await jsonRequest('/api/auth/login', {
    email: 'usuario@example.com',
    password: 'otra-clave',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Correo o contraseña incorrectos.' });
});

test('HU-002 rechaza correo inexistente con el mismo mensaje genérico', async (t) => {
  t.mock.method(User, 'findOne', () => ({ select: async () => null }));

  const response = await jsonRequest('/api/auth/login', {
    email: 'noexiste@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Correo o contraseña incorrectos.' });
});

test('HU-002 rechaza cuentas deshabilitadas sin revelar la causa', async (t) => {
  const passwordHash = await bcrypt.hash('clave-segura', 12);
  const user = { id: '68f000000000000000000003', name: 'Usuario', email: 'usuario@example.com', passwordHash, isActive: false };
  t.mock.method(User, 'findOne', () => ({ select: async () => user }));

  const response = await jsonRequest('/api/auth/login', {
    email: 'usuario@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Correo o contraseña incorrectos.' });
});

test('HU-002 acepta cuentas creadas antes del campo isActive', async (t) => {
  const passwordHash = await bcrypt.hash('clave-segura', 12);
  const user = { id: '68f000000000000000000004', name: 'Usuario', email: 'usuario@example.com', passwordHash };
  t.mock.method(User, 'findOne', () => ({ select: async () => user }));

  const response = await jsonRequest('/api/auth/login', {
    email: 'usuario@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 200);
});

test('HU-002 protege /api/auth/me con Bearer JWT', async (t) => {
  const user = { id: '68f000000000000000000005', name: 'Usuario', email: 'usuario@example.com', isActive: true };
  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  t.mock.method(User, 'findById', async () => user);

  const response = await jsonRequest('/api/auth/me', undefined, 'GET', token);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user });
});

test('HU-002 rechaza /api/auth/me sin token', async () => {
  const response = await request('/api/auth/me');
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Sesión no válida o expirada.' });
});

test('HU-002 rechaza /api/auth/me con token vencido', async (t) => {
  const token = jwt.sign({ sub: '68f000000000000000000006' }, process.env.JWT_SECRET, { expiresIn: -1 });
  t.mock.method(User, 'findById', async () => {
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

test('la conexión exige MONGODB_URI si no se proporciona una URI', async () => {
  const previous = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  await assert.rejects(connectDatabase(), /Configura MONGODB_URI/);
  process.env.MONGODB_URI = previous;
});
