const { z } = require('zod');

function paginationInteger(defaultValue, maximum, message) {
  return z.preprocess(
    (value) => (
      typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
    ),
    z.number({ error: message }).int(message).min(1, message).max(maximum, message),
  ).default(defaultValue);
}

// Como en HU-008, los parámetros ajenos se ignoran; nunca alteran el filtro público.
const listPublicPropertiesQuerySchema = z
  .object({
    page: paginationInteger(1, Number.MAX_SAFE_INTEGER, 'La página debe ser un entero mayor o igual a 1.'),
    limit: paginationInteger(12, 50, 'El límite debe ser un entero entre 1 y 50.'),
  })
  .superRefine(({ page, limit }, ctx) => {
    if (!Number.isSafeInteger((page - 1) * limit)) {
      ctx.addIssue({
        code: 'custom',
        path: ['page'],
        message: 'La página solicitada supera el rango permitido de paginación.',
      });
    }
  });

module.exports = { listPublicPropertiesQuerySchema };
