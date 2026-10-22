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

function toProperty(row) {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    propertyTypeId: Number(
      row.property_type_id,
    ),
    title: row.title,
    description: row.description,
    publicationPrice:
      row.publication_price === null
        ? null
        : Number(
            row.publication_price,
          ),
    status: row.status,
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Los ID de PostgreSQL son BIGINT.
// Solo se aceptan cadenas numéricas positivas.
function isValidId(id) {
  return /^[1-9]\d{0,18}$/.test(
    String(id),
  );
}

const toNumberOrNull = (value) =>
  value === null ||
  value === undefined
    ? null
    : Number(value);

function toCharacteristics(row) {
  if (!row) {
    return null;
  }

  return {
    propertyId: String(
      row.property_id,
    ),

    landArea: toNumberOrNull(
      row.land_area_m2,
    ),

    frontage: toNumberOrNull(
      row.frontage_m,
    ),

    depth: toNumberOrNull(
      row.depth_m,
    ),

    hasConstruction:
      row.has_construction,

    builtArea: toNumberOrNull(
      row.built_area_m2,
    ),

    bedrooms: toNumberOrNull(
      row.bedrooms,
    ),

    bathrooms: toNumberOrNull(
      row.bathrooms,
    ),

    floors: toNumberOrNull(
      row.floors,
    ),

    parkingSpaces: toNumberOrNull(
      row.parking_spaces,
    ),

    constructionAge: toNumberOrNull(
      row.age_years,
    ),

    generalCondition:
      row.general_condition ?? null,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Busca una propiedad activa/no eliminada
 * por su identificador.
 */
async function findPropertyById(id) {
  if (!isValidId(id)) {
    return null;
  }

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

/**
 * Busca un tipo de propiedad.
 */
async function findPropertyTypeById(
  id,
) {
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

  if (!rows[0]) {
    return null;
  }

  return {
    id: Number(rows[0].id),
    name: rows[0].name,
    description:
      rows[0].description,
    isActive:
      rows[0].is_active,
  };
}

/**
 * HU-004
 * Crea una nueva propiedad.
 */
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

/**
 * HU-020
 * Guarda una fotografía asociada
 * a una propiedad.
 */
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
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7
     )
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

    propertyId: String(
      row.property_id,
    ),

    imageUrl:
      row.image_url,

    storageKey:
      row.storage_key,

    mimeType:
      row.mime_type,

    fileSizeBytes:
      Number(
        row.file_size_bytes,
      ),

    isPrimary:
      row.is_primary,

    sortOrder:
      row.sort_order,

    createdAt:
      row.created_at,
  };
}

/**
 * HU-005
 * Consulta características
 * de una propiedad.
 */
async function findCharacteristicsByPropertyId(
  propertyId,
) {
  if (!isValidId(propertyId)) {
    return null;
  }

  const { rows } = await query(
    `SELECT ${CHARACTERISTICS_COLUMNS}
     FROM property_features
     WHERE property_id = $1`,
    [propertyId],
  );

  return toCharacteristics(
    rows[0],
  );
}

/**
 * HU-005
 * Inserta o actualiza
 * características de una propiedad.
 */
async function upsertCharacteristics(
  propertyId,
  data,
) {
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
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12
     )
     ON CONFLICT (property_id)
     DO UPDATE SET
       land_area_m2 =
         EXCLUDED.land_area_m2,

       frontage_m =
         EXCLUDED.frontage_m,

       depth_m =
         EXCLUDED.depth_m,

       has_construction =
         EXCLUDED.has_construction,

       built_area_m2 =
         EXCLUDED.built_area_m2,

       bedrooms =
         EXCLUDED.bedrooms,

       bathrooms =
         EXCLUDED.bathrooms,

       floors =
         EXCLUDED.floors,

       parking_spaces =
         EXCLUDED.parking_spaces,

       age_years =
         EXCLUDED.age_years,

       general_condition =
         EXCLUDED.general_condition

     RETURNING
       ${CHARACTERISTICS_COLUMNS}`,
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

  return toCharacteristics(
    rows[0],
  );
}
const LOCATION_COLUMNS = `
  id,
  property_id,
  street,
  exterior_number,
  interior_number,
  neighborhood,
  municipality,
  state,
  postal_code,
  country,
  latitude,
  longitude,
  formatted_address,
  created_at,
  updated_at
`;
function toLocation(row) {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),

    propertyId: String(
      row.property_id,
    ),

    street: row.street,

    exteriorNumber:
      row.exterior_number,

    interiorNumber:
      row.interior_number,

    neighborhood:
      row.neighborhood,

    municipality:
      row.municipality,

    state: row.state,

    postalCode:
      row.postal_code,

    country: row.country,

    latitude:
      row.latitude === null
        ? null
        : Number(
            row.latitude,
          ),

    longitude:
      row.longitude === null
        ? null
        : Number(
            row.longitude,
          ),

    formattedAddress:
      row.formatted_address,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

async function findLocationByPropertyId(
  propertyId,
) {
  if (!isValidId(propertyId)) {
    return null;
  }

  const { rows } = await query(
    `SELECT ${LOCATION_COLUMNS}
     FROM property_locations
     WHERE property_id = $1
     LIMIT 1`,
    [propertyId],
  );

  return toLocation(
    rows[0],
  );
}

async function upsertLocation(
  propertyId,
  data,
) {
  const { rows } = await query(
    `INSERT INTO property_locations (
       property_id,
       street,
       exterior_number,
       interior_number,
       neighborhood,
       municipality,
       state,
       postal_code,
       country,
       latitude,
       longitude,
       formatted_address
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12
     )
     ON CONFLICT (property_id)
     DO UPDATE SET
       street =
         EXCLUDED.street,
       exterior_number =
         EXCLUDED.exterior_number,
       interior_number =
         EXCLUDED.interior_number,
       neighborhood =
         EXCLUDED.neighborhood,
       municipality =
         EXCLUDED.municipality,
       state =
         EXCLUDED.state,
       postal_code =
         EXCLUDED.postal_code,
       country =
         EXCLUDED.country,
       latitude =
         EXCLUDED.latitude,
       longitude =
         EXCLUDED.longitude,
       formatted_address =
         EXCLUDED.formatted_address
     RETURNING ${LOCATION_COLUMNS}`,
    [
      propertyId,
      data.street ?? null,
      data.exteriorNumber ??
        null,
      data.interiorNumber ??
        null,
      data.neighborhood ?? null,
      data.municipality ?? null,
      data.state ?? null,
      data.postalCode ?? null,
      data.country ?? 'México',
      data.latitude ?? null,
      data.longitude ?? null,
      data.formattedAddress ??
        null,
    ],
  );

  return toLocation(
    rows[0],
  );
}

async function findNearbyPlaceCategories() {
  const { rows } = await query(
    `SELECT
       id,
       name,
       is_active
     FROM nearby_place_categories
     WHERE is_active = TRUE
     ORDER BY name ASC`,
  );

  return rows.map(
    (row) => ({
      id: Number(row.id),
      name: row.name,
      isActive:
        row.is_active,
    }),
  );
}

async function findNearbyPlaceCategoryById(
  categoryId,
) {
  const { rows } = await query(
    `SELECT
       id,
       name,
       is_active
     FROM nearby_place_categories
     WHERE id = $1
     LIMIT 1`,
    [categoryId],
  );

  if (!rows[0]) {
    return null;
  }

  return {
    id: Number(rows[0].id),
    name: rows[0].name,
    isActive:
      rows[0].is_active,
  };
}

async function findNearbyPlacesByPropertyId(
  propertyId,
) {
  const { rows } = await query(
    `SELECT
       np.id,
       np.property_id,
       np.category_id,
       npc.name AS category_name,
       np.name,
       np.approximate_distance_m,
       np.latitude,
       np.longitude,
       np.provider,
       np.provider_place_id,
       np.last_checked_at,
       np.created_at
     FROM nearby_places np
     INNER JOIN nearby_place_categories npc
       ON npc.id = np.category_id
     WHERE np.property_id = $1
     ORDER BY
       np.approximate_distance_m
         NULLS LAST,
       np.name ASC`,
    [propertyId],
  );

  return rows.map(
    (row) => ({
      id: String(row.id),

      propertyId: String(
        row.property_id,
      ),

      category: {
        id: Number(
          row.category_id,
        ),

        name:
          row.category_name,
      },

      name: row.name,

      approximateDistanceM:
        row.approximate_distance_m ===
        null
          ? null
          : Number(
              row.approximate_distance_m,
            ),

      latitude:
        row.latitude === null
          ? null
          : Number(
              row.latitude,
            ),

      longitude:
        row.longitude === null
          ? null
          : Number(
              row.longitude,
            ),

      provider:
        row.provider,

      providerPlaceId:
        row.provider_place_id,

      lastCheckedAt:
        row.last_checked_at,

      createdAt:
        row.created_at,
    }),
  );
}

async function createNearbyPlace({
  propertyId,
  categoryId,
  name,
  approximateDistanceM,
  latitude,
  longitude,
}) {
  const { rows } = await query(
    `INSERT INTO nearby_places (
       property_id,
       category_id,
       name,
       approximate_distance_m,
       latitude,
       longitude
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6
     )
     RETURNING id`,
    [
      propertyId,
      categoryId,
      name,
      approximateDistanceM ??
        null,
      latitude ?? null,
      longitude ?? null,
    ],
  );

  const placeId =
    rows[0].id;

  const { rows: placeRows } =
    await query(
      `SELECT
         np.id,
         np.property_id,
         np.category_id,
         npc.name AS category_name,
         np.name,
         np.approximate_distance_m,
         np.latitude,
         np.longitude,
         np.provider,
         np.provider_place_id,
         np.last_checked_at,
         np.created_at
       FROM nearby_places np
       INNER JOIN nearby_place_categories npc
         ON npc.id = np.category_id
       WHERE np.id = $1
       LIMIT 1`,
      [placeId],
    );

  const row =
    placeRows[0];

  return {
    id: String(row.id),

    propertyId: String(
      row.property_id,
    ),

    category: {
      id: Number(
        row.category_id,
      ),

      name:
        row.category_name,
    },

    name: row.name,

    approximateDistanceM:
      row.approximate_distance_m ===
      null
        ? null
        : Number(
            row.approximate_distance_m,
          ),

    latitude:
      row.latitude === null
        ? null
        : Number(
            row.latitude,
          ),

    longitude:
      row.longitude === null
        ? null
        : Number(
            row.longitude,
          ),

    provider:
      row.provider,

    providerPlaceId:
      row.provider_place_id,

    lastCheckedAt:
      row.last_checked_at,

    createdAt:
      row.created_at,
  };
}

async function deleteNearbyPlace(
  propertyId,
  placeId,
) {
  if (
    !isValidId(propertyId) ||
    !isValidId(placeId)
  ) {
    return false;
  }

  const result = await query(
    `DELETE FROM nearby_places
     WHERE id = $1
       AND property_id = $2`,
    [
      placeId,
      propertyId,
    ],
  );

  return result.rowCount > 0;
}

module.exports = {
  isValidId,

  findPropertyById,
  findPropertyTypeById,

  createProperty,
  createPhoto,

  findCharacteristicsByPropertyId,
  upsertCharacteristics,

  findLocationByPropertyId,
  upsertLocation,

  findNearbyPlaceCategories,
  findNearbyPlaceCategoryById,
  findNearbyPlacesByPropertyId,
  createNearbyPlace,
  deleteNearbyPlace,
};