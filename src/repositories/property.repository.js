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

// Los id de PostgreSQL son BIGINT; solo se aceptan cadenas numéricas.
function isValidId(id) {
  return /^[1-9]\d{0,18}$/.test(String(id));
}

// Dimensiones y construcción viven en property_features (una fila por propiedad).
// Se renombran con alias para mantener los mismos nombres que usa la API.
const CHARACTERISTICS_COLUMNS = `
  property_id,
  land_area_m2,
  frontage_m,
  depth_m,
  has_construction,
  built_area_m2,
  bedrooms,
  bathrooms,
  floors,
  parking_spaces,
  age_years,
  general_condition,
  created_at,
  updated_at
`;

const toNumberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

// pg devuelve NUMERIC y BIGINT como texto: se convierten para la API.
function toCharacteristics(row) {
  if (!row) return null;

  return {
    propertyId: String(row.property_id),
    landArea: toNumberOrNull(row.land_area_m2),
    frontage: toNumberOrNull(row.frontage_m),
    depth: toNumberOrNull(row.depth_m),
    hasConstruction: row.has_construction,
    builtArea: toNumberOrNull(row.built_area_m2),
    bedrooms: toNumberOrNull(row.bedrooms),
    bathrooms: toNumberOrNull(row.bathrooms),
    floors: toNumberOrNull(row.floors),
    parkingSpaces: toNumberOrNull(row.parking_spaces),
    constructionAge: toNumberOrNull(row.age_years),
    generalCondition: row.general_condition ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findPropertyById(id) {
  if (!isValidId(id)) return null;

  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM properties
     WHERE id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return toProperty(rows[0]);
}

async function findCharacteristicsByPropertyId(propertyId) {
  if (!isValidId(propertyId)) return null;

  const { rows } = await query(
    `SELECT ${CHARACTERISTICS_COLUMNS}
     FROM property_features
     WHERE property_id = $1`,
    [propertyId],
  );

  return toCharacteristics(rows[0]);
}

// Crea o reemplaza las características de la propiedad (property_id es UNIQUE).
// updated_at lo actualiza el trigger trg_property_features_updated_at.
async function upsertCharacteristics(propertyId, data) {
  const { rows } = await query(
    `INSERT INTO property_features (
       property_id,
       land_area_m2,
       frontage_m,
       depth_m,
       has_construction,
       built_area_m2,
       bedrooms,
       bathrooms,
       floors,
       parking_spaces,
       age_years,
       general_condition
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (property_id) DO UPDATE SET
       land_area_m2 = EXCLUDED.land_area_m2,
       frontage_m = EXCLUDED.frontage_m,
       depth_m = EXCLUDED.depth_m,
       has_construction = EXCLUDED.has_construction,
       built_area_m2 = EXCLUDED.built_area_m2,
       bedrooms = EXCLUDED.bedrooms,
       bathrooms = EXCLUDED.bathrooms,
       floors = EXCLUDED.floors,
       parking_spaces = EXCLUDED.parking_spaces,
       age_years = EXCLUDED.age_years,
       general_condition = EXCLUDED.general_condition
     RETURNING ${CHARACTERISTICS_COLUMNS}`,
    [
      propertyId,
      data.landArea,
      data.frontage,
      data.depth,
      data.hasConstruction,
      data.builtArea,
      data.bedrooms,
      data.bathrooms,
      data.floors,
      data.parkingSpaces,
      data.constructionAge,
      data.generalCondition,
    ],
  );

  return toCharacteristics(rows[0]);
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

module.exports = {
  isValidId,
  findPropertyById,
  findPropertyTypeById,
  createProperty,
  findCharacteristicsByPropertyId,
  upsertCharacteristics,
};
