const { query } = require('../config/database');

const PUBLIC_COLUMNS = `
  id,
  owner_id,
  property_type_id,
  title,
  description,
  publication_price,
  status,
  published_at,
  withdrawn_at,
  deleted_at,
  created_at,
  updated_at
`;

function toProperty(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    propertyTypeId: Number(row.property_type_id),
    title: row.title,
    description: row.description,
    publicationPrice:
      row.publication_price === null
        ? null
        : Number(row.publication_price),
    status: row.status,
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findPropertyTypeById(id) {
  const { rows } = await query(
    `SELECT
       id,
       name,
       description,
       is_active
     FROM property_types
     WHERE id = $1
     LIMIT 1`,
    [id],
  );

  if (!rows[0]) return null;

  return {
    id: Number(rows[0].id),
    name: rows[0].name,
    description: rows[0].description,
    isActive: rows[0].is_active,
  };
}

async function createProperty({
  ownerId,
  propertyTypeId,
  title,
  description,
  publicationPrice,
}) {
  const { rows } = await query(
    `INSERT INTO properties (
       owner_id,
       property_type_id,
       title,
       description,
       publication_price
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      ownerId,
      propertyTypeId,
      title,
      description || null,
      publicationPrice ?? null,
    ],
  );

  return toProperty(rows[0]);
}

async function findById(id) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM properties
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return toProperty(rows[0]);
}

async function createPhoto({
  propertyId,
  imageUrl,
  storageKey,
  mimeType,
  fileSizeBytes,
  isPrimary,
  sortOrder,
}) {
  const { rows } = await query(
    `INSERT INTO property_photos (
       property_id,
       image_url,
       storage_key,
       mime_type,
       file_size_bytes,
       is_primary,
       sort_order
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING
       id,
       property_id,
       image_url,
       storage_key,
       mime_type,
       file_size_bytes,
       is_primary,
       sort_order,
       created_at`,
    [
      propertyId,
      imageUrl,
      storageKey,
      mimeType,
      fileSizeBytes,
      isPrimary,
      sortOrder,
    ],
  );

  const row = rows[0];

  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    imageUrl: row.image_url,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}
module.exports = {
  findPropertyTypeById,
  createProperty,
   findById,
  createPhoto,
};