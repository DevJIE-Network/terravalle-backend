const { query } = require('../config/database');

const PUBLIC_COLUMNS = 'id, name, email, phone, contact_email, is_active, created_at, updated_at';
const UPDATABLE_COLUMNS = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  contactEmail: 'contact_email',
};

// Los id de PostgreSQL son BIGINT; solo se aceptan cadenas numéricas.
function isValidId(id) {
  return /^[1-9]\d{0,18}$/.test(String(id));
}

// Traduce las columnas snake_case de la base al formato camelCase de la API.
function toUser(row) {
  if (!row) return null;

  const user = {
    id: String(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    contactEmail: row.contact_email ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.password_hash !== undefined) {
    user.passwordHash = row.password_hash;
  }

  return user;
}

async function create({ name, email, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash],
  );

  return toUser(rows[0]);
}

// Incluye el hash para validar la contraseña en el inicio de sesión.
async function findByEmailWithPassword(email) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email],
  );

  return toUser(rows[0]);
}

async function findById(id) {
  if (!isValidId(id)) return null;

  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );

  return toUser(rows[0]);
}

async function isEmailTakenByOther(email, excludeUserId) {
  const { rows } = await query(
    `SELECT 1 FROM users
     WHERE LOWER(email) = LOWER($1) AND id <> $2
     LIMIT 1`,
    [email, excludeUserId],
  );

  return rows.length > 0;
}

// Solo actualiza columnas permitidas; nunca password_hash ni is_active.
async function updateProfile(id, changes) {
  if (!isValidId(id)) return null;

  const entries = Object.entries(changes).filter(([key, value]) => (
    Object.hasOwn(UPDATABLE_COLUMNS, key) && value !== undefined
  ));

  if (entries.length === 0) return findById(id);

  const assignments = entries.map(([key], index) => `${UPDATABLE_COLUMNS[key]} = $${index + 2}`);
  const values = entries.map(([, value]) => value);

  const { rows } = await query(
    `UPDATE users SET ${assignments.join(', ')}
     WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, ...values],
  );

  return toUser(rows[0]);
}

module.exports = {
  create,
  findByEmailWithPassword,
  findById,
  isEmailTakenByOther,
  updateProfile,
  isValidId,
};
