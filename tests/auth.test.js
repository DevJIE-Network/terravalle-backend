const assert = require('node:assert/strict');
const { once } = require('node:events');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { app } = require('../src/server');
const connectDatabase = require('../src/config/database');
const User = require('../src/models/User');
const { registerSchema } = require('../src/schemas/auth.schema');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

function register(body) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('el servidor responde al endpoint de estado', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('las rutas inexistentes devuelven JSON y estado 404', async () => {
  const response = await fetch(`${baseUrl}/no-existe`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: 'Ruta no encontrada.' });
});

test('el esquema normaliza el nombre y el correo', () => {
  const result = registerSchema.parse({
    name: '  Usuario TerraValle  ',
    email: '  USUARIO@EXAMPLE.COM  ',
    password: 'clave-segura',
  });

  assert.equal(result.name, 'Usuario TerraValle');
  assert.equal(result.email, 'usuario@example.com');
});

test('el esquema valida el límite de bcrypt en bytes, incluidos caracteres multibyte', () => {
  const input = { name: 'Usuario', email: 'usuario@example.com' };
  assert.equal(registerSchema.safeParse({ ...input, password: 'a'.repeat(72) }).success, true);
  assert.equal(registerSchema.safeParse({ ...input, password: 'a'.repeat(73) }).success, false);
  assert.equal(registerSchema.safeParse({ ...input, password: 'á'.repeat(37) }).success, false);
});

test('el registro rechaza datos inválidos antes de consultar la base de datos', async (t) => {
  const create = t.mock.method(User, 'create', async () => {
    throw new Error('No debe llamarse con datos inválidos.');
  });
  const response = await register({ name: 'A', email: 'incorrecto', password: 'corta' });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.errors.length, 3);
  assert.equal(create.mock.callCount(), 0);
});

test('el registro rechaza campos adicionales', async () => {
  const response = await register({
    name: 'Usuario',
    email: 'usuario@example.com',
    password: 'clave-segura',
    role: 'admin',
  });

  assert.equal(response.status, 400);
});

test('el registro rechaza solicitudes sin cuerpo', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST' });
  assert.equal(response.status, 400);
});

test('el registro rechaza JSON mal formado', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: 'El cuerpo de la solicitud debe ser JSON válido.',
  });
});

test('el servidor limita el tamaño del cuerpo JSON', async () => {
  const response = await register({ name: 'a'.repeat(11 * 1024) });
  assert.equal(response.status, 413);
});

test('el registro almacena un hash y no expone la contraseña', async (t) => {
  let saved;
  t.mock.method(User, 'create', async (data) => {
    saved = data;
    return new User(data);
  });

  const response = await register({
    name: '  Usuario  ',
    email: '  USUARIO@EXAMPLE.COM  ',
    password: 'clave-segura',
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(saved.name, 'Usuario');
  assert.equal(saved.email, 'usuario@example.com');
  assert.equal(saved.password, undefined);
  assert.notEqual(saved.passwordHash, 'clave-segura');
  assert.equal(await bcrypt.compare('clave-segura', saved.passwordHash), true);
  assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'name']);
});

test('los correos duplicados devuelven estado 409', async (t) => {
  t.mock.method(User, 'create', async () => {
    throw Object.assign(new Error('Correo duplicado'), { code: 11000 });
  });

  const response = await register({
    name: 'Usuario',
    email: 'usuario@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    message: 'El correo electrónico ya está registrado.',
  });
});

test('los errores internos no exponen detalles de la base de datos', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(User, 'create', async () => {
    throw new Error('Detalles privados de MongoDB');
  });

  const response = await register({
    name: 'Usuario',
    email: 'usuario@example.com',
    password: 'clave-segura',
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: 'Error interno del servidor.' });
});

test('el modelo omite el hash al serializarse a JSON', () => {
  const user = new User({
    name: 'Usuario',
    email: 'USUARIO@EXAMPLE.COM',
    passwordHash: 'hash-privado',
  });

  assert.equal(user.email, 'usuario@example.com');
  assert.equal(user.toJSON().passwordHash, undefined);
  assert.equal(User.schema.path('passwordHash').options.select, false);
});

test('la conexión exige una URI de MongoDB', async () => {
  await assert.rejects(connectDatabase(''), /Configura MONGODB_URI/);
});

test('la conexión utiliza la URI configurada y un tiempo de espera limitado', async (t) => {
  const connect = t.mock.method(mongoose, 'connect', async () => mongoose);
  const connection = await connectDatabase('mongodb://127.0.0.1:27017/pruebas');

  assert.equal(connection, mongoose.connection);
  assert.deepEqual(connect.mock.calls[0].arguments, [
    'mongodb://127.0.0.1:27017/pruebas',
    { serverSelectionTimeoutMS: 5000 },
  ]);
});
