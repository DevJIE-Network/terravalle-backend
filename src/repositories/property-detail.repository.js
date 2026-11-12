const database = require('../config/database');

/**
 * HU-012 · Ficha detallada pública de una propiedad.
 *
 * Integra, sin modificarla, la información de HU-004 (datos generales), HU-020 (fotos),
 * HU-005 (dimensiones y construcción), HU-006 (servicios), HU-007 (ubicación y entorno)
 * y HU-009 (estimación orientativa). Solo selecciona columnas que pueden ver los
 * compradores: nunca el dueño, rutas internas de archivos ni datos del modelo.
 *
 * Usa database.query (sin desestructurar) para poder simularla en las pruebas.
 */

const toNumberOrNull = (value) => (value === null ? null : Number(value));

// Relaciones 1:1 (UNIQUE property_id) con LEFT JOIN: una propiedad activa sin
// características o ubicación se muestra igual, con esas secciones en null.
const BASE_SQL = `
  SELECT
    p.id, p.title, p.description, p.publication_price, p.status,
    p.published_at, p.updated_at,
    p.property_type_id, pt.name AS property_type_name,
    pf.property_id AS features_property_id,
    pf.land_area_m2, pf.frontage_m, pf.depth_m, pf.has_construction,
    pf.built_area_m2, pf.bedrooms, pf.bathrooms, pf.floors, pf.parking_spaces,
    pf.age_years, pf.general_condition, pf.construction_quality,
    pl.id AS location_id,
    pl.street, pl.exterior_number, pl.neighborhood, pl.municipality, pl.state,
    pl.postal_code, pl.country, pl.latitude, pl.longitude, pl.formatted_address
  FROM properties p
  INNER JOIN property_types pt ON pt.id = p.property_type_id
  LEFT JOIN property_features pf ON pf.property_id = p.id
  LEFT JOIN property_locations pl ON pl.property_id = p.id
  WHERE p.id = $1
    AND p.deleted_at IS NULL
  LIMIT 1
`;

const PHOTOS_SQL = `
  SELECT id, image_url, is_primary
  FROM property_photos
  WHERE property_id = $1
  ORDER BY is_primary DESC, sort_order ASC, id ASC
`;

// Solo servicios que siguen activos en el catálogo de TerraValle.
const SERVICES_SQL = `
  SELECT s.id, s.name, s.description
  FROM property_services ps
  INNER JOIN services s ON s.id = ps.service_id
  WHERE ps.property_id = $1
    AND s.is_active = TRUE
  ORDER BY s.id
`;

const NEARBY_PLACES_SQL = `
  SELECT np.id, np.name, np.approximate_distance_m, np.provider,
    npc.id AS category_id, npc.name AS category_name
  FROM nearby_places np
  INNER JOIN nearby_place_categories npc ON npc.id = np.category_id
  WHERE np.property_id = $1
  ORDER BY np.approximate_distance_m NULLS LAST, np.name ASC
`;

// Solo el rango de la estimación más reciente; los factores y el modelo quedan fuera.
const LATEST_ESTIMATION_SQL = `
  SELECT estimated_value, estimated_min, estimated_max, created_at
  FROM ai_estimations
  WHERE property_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`;

function toDimensions(row) {
  if (!row.features_property_id) return null;
  return {
    landArea: toNumberOrNull(row.land_area_m2),
    frontage: toNumberOrNull(row.frontage_m),
    depth: toNumberOrNull(row.depth_m),
  };
}

function toConstruction(row) {
  if (row.has_construction !== true) return null;
  return {
    builtArea: toNumberOrNull(row.built_area_m2),
    floors: toNumberOrNull(row.floors),
    bedrooms: toNumberOrNull(row.bedrooms),
    bathrooms: toNumberOrNull(row.bathrooms),
    parkingSpaces: toNumberOrNull(row.parking_spaces),
    constructionAge: toNumberOrNull(row.age_years),
    generalCondition: row.general_condition,
    constructionQuality: row.construction_quality,
  };
}

// El número interior no se publica: identifica la vivienda exacta dentro del inmueble.
function toLocation(row) {
  if (!row.location_id) return null;
  return {
    street: row.street,
    exteriorNumber: row.exterior_number,
    neighborhood: row.neighborhood,
    municipality: row.municipality,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    latitude: toNumberOrNull(row.latitude),
    longitude: toNumberOrNull(row.longitude),
    formattedAddress: row.formatted_address,
  };
}

const toPhoto = (row) => ({
  id: String(row.id),
  imageUrl: row.image_url,
  isPrimary: row.is_primary === true,
});

const toService = (row) => ({
  id: Number(row.id),
  name: row.name,
  description: row.description,
});

const toNearbyPlace = (row) => ({
  id: String(row.id),
  name: row.name,
  category: { id: Number(row.category_id), name: row.category_name },
  approximateDistanceM: toNumberOrNull(row.approximate_distance_m),
  provider: row.provider,
});

function toEstimate(row) {
  if (!row) return null;
  return {
    estimatedMin: toNumberOrNull(row.estimated_min),
    estimatedValue: toNumberOrNull(row.estimated_value),
    estimatedMax: toNumberOrNull(row.estimated_max),
    generatedAt: row.created_at,
  };
}

/**
 * Datos base de la propiedad (aunque no esté activa) para que el controlador decida
 * entre 200, 404 y 410. Devuelve null si no existe o fue eliminada.
 */
async function findPropertyForDetail(propertyId) {
  const { rows } = await database.query(BASE_SQL, [propertyId]);
  return rows[0] || null;
}

/**
 * Relaciones de la ficha: fotos, servicios, entorno y última estimación.
 * Se consultan en paralelo porque son independientes entre sí.
 */
async function findDetailRelations(propertyId) {
  const [photos, services, nearbyPlaces, estimation] = await Promise.all([
    database.query(PHOTOS_SQL, [propertyId]),
    database.query(SERVICES_SQL, [propertyId]),
    database.query(NEARBY_PLACES_SQL, [propertyId]),
    database.query(LATEST_ESTIMATION_SQL, [propertyId]),
  ]);

  return {
    photos: photos.rows.map(toPhoto),
    services: services.rows.map(toService),
    nearbyPlaces: nearbyPlaces.rows.map(toNearbyPlace),
    estimate: toEstimate(estimation.rows[0]),
  };
}

/**
 * Arma la ficha pública a partir de la fila base y sus relaciones.
 */
function toPropertyDetail(row, relations) {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    propertyType: { id: Number(row.property_type_id), name: row.property_type_name },
    publicationPrice: toNumberOrNull(row.publication_price),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    photos: relations.photos,
    dimensions: toDimensions(row),
    hasConstruction: row.has_construction === true,
    construction: toConstruction(row),
    services: relations.services,
    location: toLocation(row),
    nearbyPlaces: relations.nearbyPlaces,
    estimate: relations.estimate,
  };
}

module.exports = {
  findPropertyForDetail,
  findDetailRelations,
  toPropertyDetail,
};
