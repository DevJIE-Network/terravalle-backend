const database = require('../config/database');

/**
 * HU-009 · Persistencia de estimaciones (tablas ai_estimations y ai_estimation_factors).
 * Usa database.query (sin desestructurar) para poder simularla en las pruebas.
 */

const toNumberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

function toEstimation(row) {
  if (!row) return null;
  const factors = typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors ?? [];

  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    requestedBy: String(row.requested_by),
    estimatedValue: toNumberOrNull(row.estimated_value),
    estimatedMin: toNumberOrNull(row.estimated_min),
    estimatedMax: toNumberOrNull(row.estimated_max),
    explanation: row.explanation,
    modelName: row.model_name,
    modelVersion: row.model_version,
    createdAt: row.created_at,
    factors,
  };
}

const FACTORS_JSON = `json_build_object(
  'name', f.factor_name,
  'value', f.factor_value,
  'impact', f.impact,
  'explanation', f.explanation
)`;

// Normaliza textos en SQL (minúsculas y sin acentos) para comparar estados y municipios.
const norm = (expression) => `translate(lower(trim(${expression})), 'áéíóúüñ', 'aeiouun')`;

/**
 * Precio de referencia más específico vigente para la zona:
 * código postal → municipio → estado. Devuelve null si no hay ninguno.
 */
async function findReferencePrice({ state, municipality, postalCode = null }) {
  const { rows } = await database.query(
    `SELECT land_price_m2, construction_price_m2, source, valid_from,
       CASE
         WHEN postal_code IS NOT NULL THEN 'postal_code'
         WHEN municipality IS NOT NULL THEN 'municipality'
         ELSE 'state'
       END AS level
     FROM reference_prices
     WHERE is_active
       AND valid_from <= CURRENT_DATE
       AND ${norm('state')} = ${norm('$1')}
       AND (municipality IS NULL OR ${norm('municipality')} = ${norm('$2')})
       AND (postal_code IS NULL OR postal_code = $3)
     ORDER BY (postal_code IS NOT NULL) DESC, (municipality IS NOT NULL) DESC, valid_from DESC, id DESC
     LIMIT 1`,
    [state, municipality, postalCode],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    landPriceM2: Number(row.land_price_m2),
    constructionPriceM2: Number(row.construction_price_m2),
    level: row.level,
    source: row.source,
    validFrom: row.valid_from,
  };
}

const COMPARABLE_COLUMNS = `
  p.publication_price,
  pf.land_area_m2,
  pf.has_construction,
  pf.built_area_m2,
  pf.construction_quality
`;

const COMPARABLE_FILTERS = `
  p.id <> $1
  AND p.property_type_id = $2
  AND p.status = 'active'
  AND p.deleted_at IS NULL
  AND p.publication_price IS NOT NULL
`;

function toComparable(row) {
  return {
    publicationPrice: toNumberOrNull(row.publication_price),
    landArea: toNumberOrNull(row.land_area_m2),
    hasConstruction: row.has_construction,
    builtArea: toNumberOrNull(row.built_area_m2),
    constructionQuality: row.construction_quality ?? null,
    distanceM: toNumberOrNull(row.distance_m),
  };
}

/**
 * Comparables: propiedades activas, con precio y del mismo tipo.
 * - Con coordenadas: las que están dentro del radio, de la más cercana a la más lejana.
 * - Sin coordenadas: las del mismo municipio y estado.
 */
async function findComparables({
  propertyId,
  propertyTypeId,
  municipality,
  state,
  latitude = null,
  longitude = null,
  radiusM = 2000,
  limit = 30,
}) {
  if (latitude !== null && longitude !== null) {
    const { rows } = await database.query(
      `SELECT * FROM (
         SELECT ${COMPARABLE_COLUMNS},
           6371000 * 2 * asin(sqrt(
             power(sin(radians(pl.latitude - $3) / 2), 2) +
             cos(radians($3)) * cos(radians(pl.latitude)) *
             power(sin(radians(pl.longitude - $4) / 2), 2)
           )) AS distance_m
         FROM properties p
         JOIN property_features pf ON pf.property_id = p.id
         JOIN property_locations pl ON pl.property_id = p.id
         WHERE ${COMPARABLE_FILTERS}
           AND pl.latitude IS NOT NULL
           AND pl.longitude IS NOT NULL
       ) nearby
       WHERE distance_m <= $5
       ORDER BY distance_m
       LIMIT $6`,
      [propertyId, propertyTypeId, latitude, longitude, radiusM, limit],
    );
    return rows.map(toComparable);
  }

  const { rows } = await database.query(
    `SELECT ${COMPARABLE_COLUMNS}, NULL AS distance_m
     FROM properties p
     JOIN property_features pf ON pf.property_id = p.id
     JOIN property_locations pl ON pl.property_id = p.id
     WHERE ${COMPARABLE_FILTERS}
       AND ${norm('pl.municipality')} = ${norm('$3')}
       AND ${norm('pl.state')} = ${norm('$4')}
     ORDER BY p.published_at DESC NULLS LAST, p.id DESC
     LIMIT $5`,
    [propertyId, propertyTypeId, municipality, state, limit],
  );
  return rows.map(toComparable);
}

/**
 * Guarda la estimación y sus factores en una sola sentencia (atómica).
 */
async function createEstimation({
  propertyId,
  requestedBy,
  estimatedValue,
  estimatedMin,
  estimatedMax,
  explanation,
  modelName,
  modelVersion,
  factors,
}) {
  const column = (key, max) => factors.map((factor) => String(factor[key] ?? '').slice(0, max));

  const { rows } = await database.query(
    `WITH estimation AS (
       INSERT INTO ai_estimations (
         property_id, requested_by, estimated_value, estimated_min, estimated_max,
         explanation, model_name, model_version
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *
     ),
     inserted AS (
       INSERT INTO ai_estimation_factors (estimation_id, factor_name, factor_value, impact, explanation)
       SELECT estimation.id, f.factor_name, f.factor_value, f.impact, f.explanation
       FROM estimation
       CROSS JOIN unnest($9::varchar[], $10::varchar[], $11::varchar[], $12::varchar[])
         WITH ORDINALITY AS f(factor_name, factor_value, impact, explanation, position)
       ORDER BY f.position
       RETURNING *
     )
     SELECT estimation.*,
       COALESCE(
         (SELECT json_agg(${FACTORS_JSON} ORDER BY f.id) FROM inserted f),
         '[]'::json
       ) AS factors
     FROM estimation`,
    [
      propertyId,
      requestedBy,
      estimatedValue,
      estimatedMin,
      estimatedMax,
      explanation,
      modelName,
      modelVersion,
      column('name', 100),
      column('value', 255),
      column('impact', 20),
      column('explanation', 500),
    ],
  );

  return toEstimation(rows[0]);
}

/**
 * Historial de estimaciones de una propiedad, de la más reciente a la más antigua.
 */
async function findEstimationsByPropertyId(propertyId, limit = 10) {
  const { rows } = await database.query(
    `SELECT e.*,
       COALESCE(
         json_agg(${FACTORS_JSON} ORDER BY f.id) FILTER (WHERE f.id IS NOT NULL),
         '[]'::json
       ) AS factors
     FROM ai_estimations e
     LEFT JOIN ai_estimation_factors f ON f.estimation_id = e.id
     WHERE e.property_id = $1
     GROUP BY e.id
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $2`,
    [propertyId, limit],
  );

  return rows.map(toEstimation);
}

module.exports = {
  findReferencePrice,
  findComparables,
  createEstimation,
  findEstimationsByPropertyId,
};
