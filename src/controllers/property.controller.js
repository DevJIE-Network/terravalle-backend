const {
  createPropertySchema,
} = require('../schemas/property.schema');

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

module.exports = {
  createProperty,
  getPropertyTypes,
};