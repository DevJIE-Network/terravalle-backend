const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadWithMockedDatabase } = require('./repository-mock');

const USER_REPO = '../src/repositories/user.repository';
const SERVICE_REPO = '../src/repositories/service.repository';

const USER_ROW = {
  id: '9007199254740993',
  name: 'Ana Pérez',
  email: 'ana@correo.com',
  phone: null,
  contact_email: 'ventas@correo.com',
  is_active: true,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-02T00:00:00.000Z',
};

const USER = {
  id: '9007199254740993',
  name: 'Ana Pérez',
  email: 'ana@correo.com',
  phone: null,
  contactEmail: 'ventas@correo.com',
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

// ------------------------------------------------------------------ user.repository

test('user.repository isValidId acepta solo BIGINT positivos como texto', (t) => {
  const { repository } = loadWithMockedDatabase(t, USER_REPO);

  for (const id of ['1', '42', 9, '9223372036854775807']) assert.equal(repository.isValidId(id), true);
  for (const id of ['0', '-1', 'abc', '1.5', '01', '12345678901234567890', '']) {
    assert.equal(repository.isValidId(id), false, `${id} no debe ser válido`);
  }
});

test('user.repository create inserta con el hash y no lo devuelve', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, USER_REPO, { rows: [USER_ROW] });

  const user = await repository.create({ name: 'Ana Pérez', email: 'ana@correo.com', passwordHash: 'hash' });

  assert.deepEqual(user, USER);
  assert.match(sqlAt(0), /^INSERT INTO users \(name, email, password_hash\) VALUES \(\$1, \$2, \$3\) RETURNING id, name, email/);
  assert.equal(sqlAt(0).includes('RETURNING id, name, email, phone, contact_email, is_active, created_at, updated_at'), true);
  assert.deepEqual(paramsAt(0), ['Ana Pérez', 'ana@correo.com', 'hash']);
});

test('user.repository findByEmailWithPassword compara sin mayúsculas e incluye el hash', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, USER_REPO, {
    rows: [{ ...USER_ROW, phone: '7711234567', password_hash: 'hash' }],
  });

  const user = await repository.findByEmailWithPassword('ANA@correo.com');

  assert.equal(user.passwordHash, 'hash');
  assert.equal(user.phone, '7711234567');
  assert.match(sqlAt(0), /, password_hash FROM users WHERE LOWER\(email\) = LOWER\(\$1\)$/);
  assert.deepEqual(paramsAt(0), ['ANA@correo.com']);
});

test('user.repository findByEmailWithPassword devuelve null si no existe', async (t) => {
  const { repository } = loadWithMockedDatabase(t, USER_REPO, { rows: [] });

  assert.equal(await repository.findByEmailWithPassword('nadie@correo.com'), null);
});

test('user.repository findById valida el id antes de consultar', async (t) => {
  const { repository, query, sqlAt, paramsAt } = loadWithMockedDatabase(t, USER_REPO, { rows: [USER_ROW] });

  assert.equal(await repository.findById('abc'), null);
  assert.equal(query.mock.callCount(), 0);

  assert.deepEqual(await repository.findById('9007199254740993'), USER);
  assert.match(sqlAt(0), /FROM users WHERE id = \$1$/);
  assert.equal(sqlAt(0).includes('password_hash'), false);
  assert.deepEqual(paramsAt(0), ['9007199254740993']);
});

test('user.repository isEmailTakenByOther excluye al propio usuario', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(
    t,
    USER_REPO,
    { rows: [{ '?column?': 1 }] },
    { rows: [] },
  );

  assert.equal(await repository.isEmailTakenByOther('ana@correo.com', '7'), true);
  assert.equal(await repository.isEmailTakenByOther('libre@correo.com', '7'), false);
  assert.match(sqlAt(0), /WHERE LOWER\(email\) = LOWER\(\$1\) AND id <> \$2 LIMIT 1$/);
  assert.deepEqual(paramsAt(0), ['ana@correo.com', '7']);
});

test('user.repository updateProfile actualiza solo columnas permitidas', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, USER_REPO, {
    rows: [{ ...USER_ROW, name: 'Ana López' }],
  });

  const user = await repository.updateProfile('7', {
    name: 'Ana López',
    contactEmail: 'nuevo@correo.com',
    phone: undefined,
    passwordHash: 'no-permitido',
    isActive: false,
  });

  assert.equal(user.name, 'Ana López');
  assert.match(sqlAt(0), /^UPDATE users SET name = \$2, contact_email = \$3 WHERE id = \$1 RETURNING /);
  assert.equal(sqlAt(0).includes('password_hash'), false);
  assert.equal(sqlAt(0).includes('is_active ='), false);
  assert.deepEqual(paramsAt(0), ['7', 'Ana López', 'nuevo@correo.com']);
});

test('user.repository updateProfile sin cambios devuelve el usuario actual', async (t) => {
  const { repository, query, sqlAt } = loadWithMockedDatabase(t, USER_REPO, { rows: [USER_ROW] });

  assert.deepEqual(await repository.updateProfile('7', { passwordHash: 'x' }), USER);
  assert.equal(query.mock.callCount(), 1);
  assert.match(sqlAt(0), /^SELECT .* FROM users WHERE id = \$1$/);
});

test('user.repository updateProfile con id inválido no consulta', async (t) => {
  const { repository, query } = loadWithMockedDatabase(t, USER_REPO);

  assert.equal(await repository.updateProfile('0', { name: 'Ana' }), null);
  assert.equal(query.mock.callCount(), 0);
});

// ------------------------------------------------------------------ service.repository

const SERVICE_ROWS = [
  { id: 1, name: 'Agua potable', description: null },
  { id: '2', name: 'Electricidad', description: 'Red de CFE' },
];
const SERVICES = [
  { id: 1, name: 'Agua potable', description: null },
  { id: 2, name: 'Electricidad', description: 'Red de CFE' },
];

test('service.repository listActiveServices devuelve solo el catálogo activo', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, SERVICE_REPO, { rows: SERVICE_ROWS });

  assert.deepEqual(await repository.listActiveServices(), SERVICES);
  assert.equal(sqlAt(0), 'SELECT id, name, description FROM services WHERE is_active = TRUE ORDER BY id');
  assert.equal(paramsAt(0), undefined);
});

test('service.repository findActiveServicesByIds filtra por la lista', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, SERVICE_REPO, { rows: SERVICE_ROWS });

  assert.deepEqual(await repository.findActiveServicesByIds([1, 2, 99]), SERVICES);
  assert.match(sqlAt(0), /WHERE is_active = TRUE AND id = ANY\(\$1::smallint\[\]\) ORDER BY id$/);
  assert.deepEqual(paramsAt(0), [[1, 2, 99]]);
});

test('service.repository findActiveServicesByIds con lista vacía no consulta', async (t) => {
  const { repository, query } = loadWithMockedDatabase(t, SERVICE_REPO);

  assert.deepEqual(await repository.findActiveServicesByIds([]), []);
  assert.equal(query.mock.callCount(), 0);
});

test('service.repository findServicesByPropertyId une la selección con el catálogo', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, SERVICE_REPO, { rows: SERVICE_ROWS });

  assert.deepEqual(await repository.findServicesByPropertyId('7'), SERVICES);
  assert.match(sqlAt(0), /FROM property_services ps JOIN services s ON s\.id = ps\.service_id WHERE ps\.property_id = \$1 ORDER BY s\.id$/);
  assert.deepEqual(paramsAt(0), ['7']);
});

test('service.repository replacePropertyServices reemplaza en una sola sentencia y devuelve lo vigente', async (t) => {
  const { repository, query, sqlAt, paramsAt } = loadWithMockedDatabase(
    t,
    SERVICE_REPO,
    { rows: [] },
    { rows: [SERVICE_ROWS[0]] },
  );

  assert.deepEqual(await repository.replacePropertyServices('7', [1]), [SERVICES[0]]);
  assert.equal(query.mock.callCount(), 2);
  assert.match(sqlAt(0), /^WITH removed AS \( DELETE FROM property_services WHERE property_id = \$1 AND NOT \(service_id = ANY\(\$2::smallint\[\]\)\) \)/);
  assert.match(sqlAt(0), /ON CONFLICT \(property_id, service_id\) DO NOTHING$/);
  assert.deepEqual(paramsAt(0), ['7', [1]]);
  assert.deepEqual(paramsAt(1), ['7']);
});
