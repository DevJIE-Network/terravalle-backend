const { z } = require('zod');

const updateProfileSchema = z
  .strictObject({
    name: z.string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres.')
      .max(100, 'El nombre no puede superar los 100 caracteres.')
      .optional(),
    email: z.string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: 'El correo electrónico no es válido.' }))
      .optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.email !== undefined,
    'Envía al menos un campo para actualizar (name o email).',
  );

module.exports = { updateProfileSchema };
