const { z } = require('zod');

function emptyToUndefined(value) {
  if (
    typeof value === 'string' &&
    value.trim() === ''
  ) {
    return undefined;
  }

  return value;
}

function optionalText(maxLength) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(maxLength)
      .optional(),
  );
}

function optionalNumber(schema) {
  return z.preprocess(
    (value) => {
      if (
        value === '' ||
        value === null ||
        value === undefined
      ) {
        return undefined;
      }

      return value;
    },
    schema.optional(),
  );
}

const saveLocationSchema = z
  .object({
    street: optionalText(150),

    exteriorNumber:
      optionalText(20),

    interiorNumber:
      optionalText(20),

    neighborhood:
      optionalText(120),

    municipality:
      optionalText(120),

    state:
      optionalText(120),

    postalCode:
      optionalText(10),

    country: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .min(2)
        .max(80)
        .default('México'),
    ),

    latitude: optionalNumber(
      z.coerce
        .number()
        .min(
          -90,
          'La latitud debe estar entre -90 y 90.',
        )
        .max(
          90,
          'La latitud debe estar entre -90 y 90.',
        ),
    ),

    longitude: optionalNumber(
      z.coerce
        .number()
        .min(
          -180,
          'La longitud debe estar entre -180 y 180.',
        )
        .max(
          180,
          'La longitud debe estar entre -180 y 180.',
        ),
    ),

    formattedAddress:
      optionalText(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasLatitude =
      data.latitude !== undefined;

    const hasLongitude =
      data.longitude !== undefined;

    if (
      hasLatitude !== hasLongitude
    ) {
      ctx.addIssue({
        code:
          z.ZodIssueCode.custom,
        path: ['latitude'],
        message:
          'La latitud y longitud deben enviarse juntas.',
      });

      ctx.addIssue({
        code:
          z.ZodIssueCode.custom,
        path: ['longitude'],
        message:
          'La latitud y longitud deben enviarse juntas.',
      });
    }

    const hasCoordinates =
      hasLatitude &&
      hasLongitude;

    const hasStructuredAddress =
      Boolean(
        data.municipality &&
          data.state,
      );

    const hasFormattedAddress =
      Boolean(
        data.formattedAddress,
      );

    if (
      !hasCoordinates &&
      !hasStructuredAddress &&
      !hasFormattedAddress
    ) {
      ctx.addIssue({
        code:
          z.ZodIssueCode.custom,
        path: [
          'formattedAddress',
        ],
        message:
          'Debes proporcionar una dirección válida o coordenadas de la propiedad.',
      });
    }
  });

const createNearbyPlaceSchema = z
  .object({
    categoryId: z.coerce
      .number()
      .int(
        'La categoría debe ser válida.',
      )
      .positive(
        'La categoría debe ser válida.',
      ),

    name: z
      .string()
      .trim()
      .min(
        2,
        'El nombre es obligatorio.',
      )
      .max(
        150,
        'El nombre no puede superar los 150 caracteres.',
      ),

    approximateDistanceM:
      optionalNumber(
        z.coerce
          .number()
          .int(
            'La distancia debe ser un número entero.',
          )
          .nonnegative(
            'La distancia no puede ser negativa.',
          ),
      ),

    latitude: optionalNumber(
      z.coerce
        .number()
        .min(-90)
        .max(90),
    ),

    longitude: optionalNumber(
      z.coerce
        .number()
        .min(-180)
        .max(180),
    ),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasLatitude =
      data.latitude !== undefined;

    const hasLongitude =
      data.longitude !== undefined;

    if (
      hasLatitude !== hasLongitude
    ) {
      ctx.addIssue({
        code:
          z.ZodIssueCode.custom,
        path: ['latitude'],
        message:
          'Las coordenadas del punto cercano deben enviarse completas.',
      });
    }
  });

module.exports = {
  saveLocationSchema,
  createNearbyPlaceSchema,
};