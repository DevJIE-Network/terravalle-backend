const { query } = require('../config/database');

const PUBLIC_COLUMNS =
  'id, user_id, property_id, created_at';

function isValidId(id) {
  return /^[1-9]\d{0,18}$/.test(
    String(id),
  );
}

/**
 * HU-014 · Busca una propiedad activa/no eliminada por su ID.
 * Devuelve el objeto de propiedad con naming consistente (camelCase).
 * Used by controller para validar antes de operar sobre favoritos.
 */
async function findPropertyById(id) {
  if (!isValidId(id)) {
    return null;
  }

  const { rows } = await query(
    `SELECT id,
             owner_id,
             property_type_id,
             title,
             description,
             publication_price,
             status,
             deleted_at
      FROM properties
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [id],
  );

  if (!rows[0]) {
    return null;
  }

  return {
    id: String(rows[0].id),
    ownerId: String(rows[0].owner_id),
    propertyTypeId: Number(rows[0].property_type_id),
    title: rows[0].title,
    description: rows[0].description,
    publicationPrice: rows[0].publication_price,
    status: rows[0].status,
    deletedAt: rows[0].deleted_at,  // camelCase consistente
  };
}

/**
 * HU-014 · Agrega una propiedad a favoritos usando constraint UNIQUE de BD.
 * Inserta con ON CONFLICT DO NOTHING y RETURNING.
 * Retorna { created: true, favorite } si se insertó ahora.
 * Retorna { created: false, favorite } si ya existía (constraint bloqueó el insert).
 * La protección contra concurrencia es el UNIQUE de BD, no un check previo.
 */
async function addFavorite(userId, propertyId) {
  if (!isValidId(userId) || !isValidId(propertyId)) {
    const error = new Error('ID de usuario o propiedad inválido.');
    error.status = 400;
    throw error;
  }

  const { rows } = await query(
    `INSERT INTO favorites (user_id, property_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, property_id) DO NOTHING
     RETURNING id, user_id, property_id, created_at`,
    [userId, propertyId],
  );

  if (rows.length > 0) {
    // Insert succeeded (no conflict)
    return { created: true, favorite: rows[0] };
  }

  // Conflict occurred -> ON CONFLICT DO NOTHING
  // Consultar la fila existente para devolver información consistente
  const existing = await getFavoriteByUserAndProperty(userId, propertyId);
  return { created: false, favorite: existing };
}

/**
 * Obtiene un favorito específico por user_id y property_id.
 */
async function getFavoriteByUserAndProperty(userId, propertyId) {
  if (!isValidId(userId) || !isValidId(propertyId)) {
    return null;
  }

  const { rows } = await query(
    `SELECT id, user_id, property_id, created_at
     FROM favorites
     WHERE user_id = $1 AND property_id = $2
     LIMIT 1`,
    [userId, propertyId],
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * HU-014 · Lista todos los favoritos del usuario autenticado.
 * Filtra propiedades: solo active y deleted_at IS NULL.
 * Orden: created_at DESC, id DESC (desempate determinista).
 * Retorna array directo (el controller construye { favorites }).
 */
async function getFavoritesByUser(userId) {
  if (!isValidId(userId)) {
    const error = new Error('ID de usuario inválido.');
    error.status = 400;
    throw error;
  }

  const { rows } = await query(
    `SELECT f.id,
            f.property_id,
            f.created_at,
            p.id AS property_id,
            p.title,
            p.publication_price,
            p.status,
            p.deleted_at,
            pt.name AS property_type_name
     FROM favorites f
     INNER JOIN properties p ON p.id = f.property_id
     LEFT JOIN property_types pt ON pt.id = p.property_type_id
     WHERE f.user_id = $1
       AND p.status = 'active'        -- NUEVA: solo propiedades activas
       AND p.deleted_at IS NULL       -- Ya estaba, se mantiene
     ORDER BY f.created_at DESC, f.id DESC`,
    [userId],
  );

  return rows.map((row) => ({
    id: String(row.id),
    propertyId: String(row.property_id),
    createdAt: row.created_at,

    // Filtrado en SQL: solo active y no eliminadas
    isActive: row.status === 'active' && row.deleted_at === null,

    // Datos del resumen público HU-010 (sin datos privados del vendedor)
    title: row.title,
    publicationPrice: row.publication_price,  // ya es número o null por la BD
    propertyType: { id: Number(row.property_type_id), name: row.property_type_name },
  }));
}

/**
 * HU-014 · Elimina una relación de favorito.
 * Solo elimina la relación usuario-propiedad.
 * No modifica la propiedad, su estado, vendedor ni favoritos de otros usuarios.
 * Retorna true si se eliminó, false si no existía.
 */
async function removeFavorite(userId, propertyId) {
  if (!isValidId(userId) || !isValidId(propertyId)) {
    const error = new Error('ID de usuario o propiedad inválido.');
    error.status = 400;
    throw error;
  }

  const { rows } = await query(
    `DELETE FROM favorites
     WHERE user_id = $1 AND property_id = $2
     RETURNING id`,
    [userId, propertyId],
  );

  return rows.length > 0;
}

module.exports = {
  isValidId,
  findPropertyById,
  addFavorite,
  getFavoriteByUserAndProperty,
  getFavoritesByUser,
  removeFavorite,
};