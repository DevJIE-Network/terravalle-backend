const {
  createPropertySchema,
} = require('../schemas/property.schema');

const propertyRepository = require(
  '../repositories/property.repository',
);

async function createProperty(req, res, next) {
  const result =
    createPropertySchema.safeParse(
      req.body,
    );

  if (!result.success) {
    return res.status(400).json({
      message:
        'Los datos de la propiedad no son válidos.',

      errors:
        result.error.issues.map(
          (issue) => ({
            field:
              issue.path.join('.'),
            message:
              issue.message,
          }),
        ),
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

    if (
      !propertyType ||
      !propertyType.isActive
    ) {
      return res.status(400).json({
        message:
          'El tipo de propiedad seleccionado no es válido.',
      });
    }

    const property =
      await propertyRepository.createProperty(
        {
          ownerId:
            req.auth.userId,

          propertyTypeId,

          title,

          description,

          publicationPrice,
        },
      );

    return res.status(201).json({
      message:
        'Propiedad registrada correctamente.',

      property,
    });
  } catch (error) {
    return next(error);
  }
}

async function uploadPhotos(
  req,
  res,
  next,
) {
  try {
    const { propertyId } =
      req.params;

    const property =
      await propertyRepository.findById(
        propertyId,
      );

    if (!property) {
      return res.status(404).json({
        message:
          'Propiedad no encontrada.',
      });
    }

    if (
      property.ownerId !==
      String(req.auth.userId)
    ) {
      return res.status(403).json({
        message:
          'No tienes permiso para modificar esta propiedad.',
      });
    }

    if (
      !req.files ||
      req.files.length === 0
    ) {
      return res.status(400).json({
        message:
          'Selecciona al menos una fotografía.',
      });
    }

    let primaryIndex = Number(
      req.body.primaryIndex ?? 0,
    );

    if (
      !Number.isInteger(
        primaryIndex,
      ) ||
      primaryIndex < 0 ||
      primaryIndex >=
        req.files.length
    ) {
      primaryIndex = 0;
    }

    const photos = [];

    for (
      let index = 0;
      index <
      req.files.length;
      index += 1
    ) {
      const file =
        req.files[index];

      const photo =
        await propertyRepository.createPhoto(
          {
            propertyId,

            imageUrl:
              `/uploads/properties/${file.filename}`,

            storageKey:
              file.filename,

            mimeType:
              file.mimetype,

            fileSizeBytes:
              file.size,

            isPrimary:
              index ===
              primaryIndex,

            sortOrder:
              index,
          },
        );

      photos.push(photo);
    }

    return res.status(201).json({
      message:
        'Fotografías guardadas correctamente.',

      photos,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createProperty,
  uploadPhotos,
};