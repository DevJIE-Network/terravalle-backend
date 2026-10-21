const {
  createPropertySchema,
} = require('../schemas/property.schema');

const {
  saveCharacteristicsSchema,
  toCharacteristicsRecord,
} = require('../schemas/property-characteristics.schema');

const propertyRepository = require(
  '../repositories/property.repository',
);

async function createProperty(req, res, next) {
  const result = createPropertySchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: 'Los datos de la propiedad no son válidos.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const {
      title,
      propertyTypeId,
      description,
      publicationPrice,
    } = result.data;

    const propertyType =
      await propertyRepository.findPropertyTypeById(
        propertyTypeId,
      );

    if (!propertyType || !propertyType.isActive) {
      return res.status(400).json({
        message:
          'El tipo de propiedad seleccionado no es válido.',
      });
    }

    const property =
      await propertyRepository.createProperty({
        ownerId: req.auth.userId,
        propertyTypeId,
        title,
        description,
        publicationPrice,
      });

    return res.status(201).json({
      message: 'Propiedad registrada correctamente.',
      property,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPropertyTypes(_req, res, next) {
  try {
    const propertyTypes =
      await propertyRepository.listActiveTypes();

    return res.status(200).json({
      propertyTypes,
    });
  } catch (error) {
    return next(error);
  }
}

const PROPERTY_NOT_FOUND_MESSAGE = 'Propiedad no encontrada.';
const NOT_OWNER_MESSAGE = 'No tienes permiso para modificar esta propiedad.';

// Verifica que la propiedad exista y pertenezca al usuario autenticado.
// Devuelve la propiedad, o null después de enviar la respuesta de error (404 / 403).
async function loadOwnedProperty(req, res) {
  const property = await propertyRepository.findPropertyById(req.params.id);

  if (!property) {
    res.status(404).json({ message: PROPERTY_NOT_FOUND_MESSAGE });
    return null;
  }

  if (property.ownerId !== String(req.auth.userId)) {
    res.status(403).json({ message: NOT_OWNER_MESSAGE });
    return null;
  }

  return property;
}

// HU-005: registra o actualiza dimensiones del terreno y características de construcción.
async function saveCharacteristics(req, res, next) {
  try {
    const property = await loadOwnedProperty(req, res);
    if (!property) return undefined;

    const result = saveCharacteristicsSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: 'Las dimensiones y características no son válidas.',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const characteristics = await propertyRepository.upsertCharacteristics(
      property.id,
      toCharacteristicsRecord(result.data),
    );

    return res.status(200).json({
      message: 'Dimensiones y características guardadas correctamente.',
      characteristics,
    });
  } catch (error) {
    return next(error);
  }
}

// HU-005: consulta las dimensiones y características de una propiedad propia.
async function getCharacteristics(req, res, next) {
  try {
    const property = await loadOwnedProperty(req, res);
    if (!property) return undefined;

    const characteristics = await propertyRepository.findCharacteristicsByPropertyId(property.id);

    return res.status(200).json({ characteristics });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createProperty,
  getPropertyTypes,
  saveCharacteristics,
  getCharacteristics,
};
