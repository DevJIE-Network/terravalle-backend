const {
  createPropertySchema,
} = require('../schemas/property.schema');

const {
  saveCharacteristicsSchema,
  toCharacteristicsRecord,
} = require(
  '../schemas/property-characteristics.schema',
);

const propertyRepository = require(
  '../repositories/property.repository',
);

const serviceRepository = require(
  '../repositories/service.repository',
);

const {
  saveServicesSchema,
  uniqueServiceIds,
} = require('../schemas/property-services.schema');

const PROPERTY_NOT_FOUND_MESSAGE =
  'Propiedad no encontrada.';

const NOT_OWNER_MESSAGE =
  'No tienes permiso para modificar esta propiedad.';

/**
 * HU-004
 * Registra una nueva propiedad.
 */
async function createProperty(req, res, next) {
  const result =
    createPropertySchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message:
        'Los datos de la propiedad no son válidos.',

      errors: result.error.issues.map(
        (issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
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
      await propertyRepository.createProperty({
        ownerId: req.auth.userId,
        propertyTypeId,
        title,
        description,
        publicationPrice,
      });

    return res.status(201).json({
      message:
        'Propiedad registrada correctamente.',
      property,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Comprueba que una propiedad exista
 * y pertenezca al usuario autenticado.
 */
async function loadOwnedProperty(
  propertyId,
  userId,
  res,
) {
  const property =
    await propertyRepository.findPropertyById(
      propertyId,
    );

  if (!property) {
    res.status(404).json({
      message:
        PROPERTY_NOT_FOUND_MESSAGE,
    });

    return null;
  }

  if (
    property.ownerId !==
    String(userId)
  ) {
    res.status(403).json({
      message:
        NOT_OWNER_MESSAGE,
    });

    return null;
  }

  return property;
}

/**
 * HU-020
 * Guarda las fotografías de una propiedad.
 */
async function uploadPhotos(
  req,
  res,
  next,
) {
  try {
    const { propertyId } =
      req.params;

    const property =
      await loadOwnedProperty(
        propertyId,
        req.auth.userId,
        res,
      );

    if (!property) {
      return undefined;
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
      !Number.isInteger(primaryIndex) ||
      primaryIndex < 0 ||
      primaryIndex >= req.files.length
    ) {
      primaryIndex = 0;
    }

    const photos = [];

    for (
      let index = 0;
      index < req.files.length;
      index += 1
    ) {
      const file =
        req.files[index];

      const photo =
        await propertyRepository.createPhoto({
          propertyId:
            property.id,

          imageUrl:
            `/uploads/properties/${file.filename}`,

          storageKey:
            file.filename,

          mimeType:
            file.mimetype,

          fileSizeBytes:
            file.size,

          isPrimary:
            index === primaryIndex,

          sortOrder:
            index,
        });

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

/**
 * HU-005
 * Registra o actualiza dimensiones
 * y características de construcción.
 */
async function saveCharacteristics(
  req,
  res,
  next,
) {
  try {
    const property =
      await loadOwnedProperty(
        req.params.id,
        req.auth.userId,
        res,
      );

    if (!property) {
      return undefined;
    }

    const result =
      saveCharacteristicsSchema.safeParse(
        req.body,
      );

    if (!result.success) {
      return res.status(400).json({
        message:
          'Las dimensiones y características no son válidas.',

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

    const characteristics =
      await propertyRepository.upsertCharacteristics(
        property.id,
        toCharacteristicsRecord(
          result.data,
        ),
      );

    return res.status(200).json({
      message:
        'Dimensiones y características guardadas correctamente.',
      characteristics,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-005
 * Consulta las dimensiones y características
 * de una propiedad perteneciente al usuario.
 */
async function getCharacteristics(
  req,
  res,
  next,
) {
  try {
    const property =
      await loadOwnedProperty(
        req.params.id,
        req.auth.userId,
        res,
      );

    if (!property) {
      return undefined;
    }

    const characteristics =
      await propertyRepository.findCharacteristicsByPropertyId(
        property.id,
      );

    return res.status(200).json({
      characteristics,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-006
 * Consulta los servicios registrados en una propiedad del usuario.
 */
async function getServices(req, res, next) {
  try {
    const property = await loadOwnedProperty(req.params.id, req.auth.userId, res);

    if (!property) {
      return undefined;
    }

    const services = await serviceRepository.findServicesByPropertyId(property.id);

    return res.status(200).json({ services });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-006
 * Registra o actualiza los servicios disponibles en una propiedad.
 * Recibe la selección completa: lo que no venga se desmarca.
 */
async function saveServices(req, res, next) {
  try {
    const property = await loadOwnedProperty(req.params.id, req.auth.userId, res);

    if (!property) {
      return undefined;
    }

    const result = saveServicesSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: 'La selección de servicios no es válida.',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const serviceIds = uniqueServiceIds(result.data.serviceIds);

    // Solo se aceptan servicios del catálogo de TerraValle que sigan activos.
    const validServices = await serviceRepository.findActiveServicesByIds(serviceIds);

    if (validServices.length !== serviceIds.length) {
      const validIds = new Set(validServices.map((service) => service.id));
      const invalidIds = serviceIds.filter((id) => !validIds.has(id));

      return res.status(400).json({
        message: 'Uno o más servicios no existen o no están disponibles.',
        invalidServiceIds: invalidIds,
      });
    }

    const services = await serviceRepository.replacePropertyServices(property.id, serviceIds);

    return res.status(200).json({
      message: 'Servicios de la propiedad guardados correctamente.',
      services,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createProperty,
  uploadPhotos,
  saveCharacteristics,
  getCharacteristics,
  getServices,
  saveServices,
};