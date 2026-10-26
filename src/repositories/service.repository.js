const { query } = require('../config/database');

function toService(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
  };
}

/**
 * HU-006
 * Catálogo de servicios controlado por TerraValle (solo los activos).
 */
async function listActiveServices() {
  const { rows } = await query(
    `SELECT id, name, description
     FROM services
     WHERE is_active = TRUE
     ORDER BY id`,
  );

  return rows.map(toService);
}

/**
 * HU-006
 * Servicios activos del catálogo cuyos id vienen en la lista.
 * Sirve para detectar id inexistentes o desactivados.
 */
async function findActiveServicesByIds(serviceIds) {
  if (serviceIds.length === 0) return [];

  const { rows } = await query(
    `SELECT id, name, description
     FROM services
     WHERE is_active = TRUE
       AND id = ANY($1::smallint[])
     ORDER BY id`,
    [serviceIds],
  );

  return rows.map(toService);
}

/**
 * HU-006
 * Servicios registrados en una propiedad.
 */
async function findServicesByPropertyId(propertyId) {
  const { rows } = await query(
    `SELECT s.id, s.name, s.description
     FROM property_services ps
     JOIN services s ON s.id = ps.service_id
     WHERE ps.property_id = $1
     ORDER BY s.id`,
    [propertyId],
  );

  return rows.map(toService);
}

/**
 * HU-006
 * Reemplaza la selección de servicios de una propiedad en una sola sentencia (atómica):
 * borra los que ya no vienen e inserta los nuevos. La llave primaria
 * (property_id, service_id) y ON CONFLICT impiden duplicados.
 * @returns {Promise<object[]>} servicios vigentes de la propiedad
 */
async function replacePropertyServices(propertyId, serviceIds) {
  await query(
    `WITH removed AS (
       DELETE FROM property_services
       WHERE property_id = $1
         AND NOT (service_id = ANY($2::smallint[]))
     )
     INSERT INTO property_services (property_id, service_id)
     SELECT $1, UNNEST($2::smallint[])
     ON CONFLICT (property_id, service_id) DO NOTHING`,
    [propertyId, serviceIds],
  );

  return findServicesByPropertyId(propertyId);
}

module.exports = {
  listActiveServices,
  findActiveServicesByIds,
  findServicesByPropertyId,
  replacePropertyServices,
};
