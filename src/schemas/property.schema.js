const { z } = require('zod');

const createPropertySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'El título debe tener al menos 3 caracteres.')
      .max(150, 'El título no puede superar los 150 caracteres.'),

    propertyTypeId: z.coerce
      .number()
      .int('El tipo de propiedad debe ser válido.')
      .positive('El tipo de propiedad debe ser válido.'),

    description: z
      .string()
      .trim()
      .max(
        3000,
        'La descripción no puede superar los 3000 caracteres.',
      )
      .optional()
      .default(''),

    publicationPrice: z
      .preprocess(
        (value) =>
          value === '' || value === null || value === undefined
            ? undefined
            : value,
        z.coerce
          .number()
          .nonnegative('El precio no puede ser negativo.')
          .optional(),
      ),
  })
  .strict();

module.exports = {
  createPropertySchema,
};