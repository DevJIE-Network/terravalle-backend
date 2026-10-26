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

// Coordenadas compartidas por la ubicación de la propiedad y los puntos cercanos.
const latitudeSchema = optionalNumber(
  z.coerce
    .number()
    .min(-90, 'La latitud debe estar entre -90 y 90.')
    .max(90, 'La latitud debe estar entre -90 y 90.'),
);

const longitudeSchema = optionalNumber(
  z.coerce
    .number()
    .min(-180, 'La longitud debe estar entre -180 y 180.')
    .max(180, 'La longitud debe estar entre -180 y 180.'),
);

/**
 * Exige que latitud y longitud se envíen juntas.
 * @returns {boolean} true si se enviaron ambas coordenadas.
 */
function validateCoordinatePair(data, ctx, message) {
  const hasLatitude = data.latitude !== undefined;
  const hasLongitude = data.longitude !== undefined;

  if (hasLatitude !== hasLongitude) {
    for (const field of ['latitude', 'longitude']) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message,
      });
    }
  }

  return hasLatitude && hasLongitude;
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

    latitude: latitudeSchema,

    longitude: longitudeSchema,

    formattedAddress:
      optionalText(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasCoordinates = validateCoordinatePair(
      data,
      ctx,
      'La latitud y longitud deben enviarse juntas.',
    );

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
      )
      .max(
        32767,
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

    latitude: latitudeSchema,

    longitude: longitudeSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    validateCoordinatePair(
      data,
      ctx,
      'Las coordenadas del punto cercano deben enviarse completas.',
    );
  });

module.exports = {
  saveLocationSchema,
  createNearbyPlaceSchema,
};