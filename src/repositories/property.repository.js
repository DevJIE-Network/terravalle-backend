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

/**
 * HU-008
 * Cuenta las propiedades del vendedor (sin las eliminadas lógicamente),
 * opcionalmente filtradas por estado.
 */
async function countPropertiesByOwnerId(ownerId, status = null) {
  const { rows } = await query(
    `SELECT COUNT(*) AS total
     FROM properties
     WHERE owner_id = $1
       AND deleted_at IS NULL
       AND ($2::varchar IS NULL OR status = $2::varchar)`,
    [ownerId, status],
  );

  return Number(rows[0].total);
}

/**
 * HU-008
 * Lista únicamente las propiedades del vendedor, de la más reciente a la más antigua.
 * Incluye las retiradas para conservar la trazabilidad.
 */
async function findPropertiesByOwnerId(ownerId, { status = null, limit = 20, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM properties
     WHERE owner_id = $1
       AND deleted_at IS NULL
       AND ($2::varchar IS NULL OR status = $2::varchar)
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [ownerId, status, limit, offset],
  );

  return rows.map(toProperty);
}

// Campos editables de HU-008 y su columna. owner_id y status nunca se actualizan aquí.
const UPDATABLE_COLUMNS = {
  title: 'title',
  propertyTypeId: 'property_type_id',
  description: 'description',
  publicationPrice: 'publication_price',
};

/**
 * HU-008
 * Actualiza solo los campos enviados. La condición owner_id evita modificar propiedades
 * ajenas aunque falle una validación previa, y las retiradas no se pueden editar.
 * Devuelve null si ninguna fila cumplió las condiciones.
 */
async function updateProperty(propertyId, ownerId, fields) {
  const entries = Object.entries(fields).filter(([key]) => UPDATABLE_COLUMNS[key]);

  if (entries.length === 0) {
    throw new Error('updateProperty requiere al menos un campo editable.');
  }

  const assignments = entries.map(([key], index) => `${UPDATABLE_COLUMNS[key]} = $${index + 3}`);
  const values = [propertyId, ownerId, ...entries.map(([, value]) => value)];

  const { rows } = await query(
    `UPDATE properties
     SET ${assignments.join(', ')}
     WHERE id = $1
       AND owner_id = $2
       AND deleted_at IS NULL
       AND status <> 'withdrawn'
     RETURNING ${PUBLIC_COLUMNS}`,
    values,
  );

  return toProperty(rows[0]);
}

/**
 * HU-008
 * Cambia el estado de publicación (active / inactive / withdrawn) y registra el cambio
 * en property_status_history, todo en una sola sentencia (atómica).
 * - Solo actúa si la propiedad es del vendedor y sigue en `previousStatus`
 *   (evita pisar un cambio concurrente). Devuelve null si no se cumplió.
 * - published_at se fija la primera vez que queda activa; withdrawn_at al retirarla.
 * - El retiro es lógico: la fila y sus datos relacionados se conservan.
 */
async function changePropertyStatus({
  propertyId,
  ownerId,
  previousStatus,
  newStatus,
  reason = null,
}) {
  const { rows } = await query(
    `WITH updated AS (
       UPDATE properties
       SET status = $3::varchar,
           published_at = CASE
             WHEN $3::varchar = 'active' AND published_at IS NULL THEN CURRENT_TIMESTAMP
             ELSE published_at
           END,
           withdrawn_at = CASE
             WHEN $3::varchar = 'withdrawn' THEN CURRENT_TIMESTAMP
             ELSE withdrawn_at
           END
       WHERE id = $1::bigint
         AND owner_id = $2::bigint
         AND status = $4::varchar
         AND deleted_at IS NULL
       RETURNING ${PUBLIC_COLUMNS}
     ),
     history AS (
       INSERT INTO property_status_history (
         property_id,
         previous_status,
         new_status,
         changed_by,
         reason
       )
       SELECT id, $4::varchar, $3::varchar, $2::bigint, $5::varchar
       FROM updated
     )
     SELECT ${PUBLIC_COLUMNS} FROM updated`,
    [propertyId, ownerId, newStatus, previousStatus, reason],
  );

  return toProperty(rows[0]);
}

module.exports = {
  isValidId,

  findPropertyById,
  findPropertyTypeById,

  createProperty,
  createPhoto,

  findCharacteristicsByPropertyId,
  upsertCharacteristics,

  // HU-007
  findLocationByPropertyId,
  upsertLocation,

  findNearbyPlaceCategories,
  findNearbyPlaceCategoryById,
  findNearbyPlacesByPropertyId,
  createNearbyPlace,
  deleteNearbyPlace,

  // HU-008
  countPropertiesByOwnerId,
  findPropertiesByOwnerId,
  updateProperty,
  changePropertyStatus,
};