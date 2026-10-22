const { z } = require('zod');

// Máximo de servicios por propiedad. El catálogo de TerraValle tiene 8; el margen permite crecerlo.
const MAX_SERVICES = 30;

/**
 * HU-006
 * Cuerpo de PUT /api/properties/:id/services.
 * `serviceIds` es la selección COMPLETA: lo que no venga se desmarca. Un arreglo vacío quita todos.
 */
const saveServicesSchema = z.strictObject({
  serviceIds: z
    .array(
      z.coerce
        .number({ error: 'Cada servicio debe ser un identificador numérico.' })
        .int('Cada servicio debe ser un identificador entero.')
        .positive('Cada servicio debe ser un identificador válido.'),
      { error: 'Envía la lista de servicios en "serviceIds".' },
    )
    .max(MAX_SERVICES, `No puedes seleccionar más de ${MAX_SERVICES} servicios.`),
});

/** Quita duplicados conservando el orden: una propiedad no repite un mismo servicio. */
function uniqueServiceIds(serviceIds) {
  return [...new Set(serviceIds)];
}

module.exports = {
  saveServicesSchema,
  uniqueServiceIds,
};
