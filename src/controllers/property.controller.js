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
  STATUS_TRANSITIONS,
  updatePropertySchema,
  toPropertyUpdate,
  changeStatusSchema,
  toStatusChange,
  listPropertiesQuerySchema,
  toListOptions,
} = require('../schemas/property-management.schema');

const {
  saveServicesSchema,
  uniqueServiceIds,
} = require('../schemas/property-services.schema');

const PROPERTY_NOT_FOUND_MESSAGE =
  'Propiedad no encontrada.';

const NOT_OWNER_MESSAGE =
  'No tienes permiso para modificar esta propiedad.';

const NOT_OWNER_VIEW_MESSAGE =
  'No tienes permiso para consultar esta propiedad.';

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
 * `forbiddenMessage` permite distinguir si se intentó
 * consultar o modificar una propiedad ajena.
 */
async function loadOwnedProperty(
  propertyId,
  userId,
  res,
  forbiddenMessage = NOT_OWNER_MESSAGE,
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
        forbiddenMessage,
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
        NOT_OWNER_VIEW_MESSAGE,
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
    const property = await loadOwnedProperty(
      req.params.id,
      req.auth.userId,
      res,
      NOT_OWNER_VIEW_MESSAGE,
    );

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

const WITHDRAWN_MESSAGE =
  'La propiedad fue retirada y ya no se puede modificar.';

const STATUS_CONFLICT_MESSAGE =
  'El estado de la propiedad cambió. Actualiza la información e inténtalo de nuevo.';

const withValidationErrors = (res, message, error) =>
  res.status(400).json({
    message,
    errors: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  });

/**
 * HU-008
 * Lista únicamente las propiedades del vendedor autenticado.
 * Filtros opcionales: ?status=draft|active|inactive|withdrawn&page=1&limit=20
 */
async function listMyProperties(req, res, next) {
  try {
    const result = listPropertiesQuerySchema.safeParse(req.query);

    if (!result.success) {
      return withValidationErrors(res, 'Los filtros de consulta no son válidos.', result.error);
    }

    const { status, page, limit } = toListOptions(result.data);
    const ownerId = String(req.auth.userId);

    const [total, properties] = await Promise.all([
      propertyRepository.countPropertiesByOwnerId(ownerId, status),
      propertyRepository.findPropertiesByOwnerId(ownerId, {
        status,
        limit,
        offset: (page - 1) * limit,
      }),
    ]);

    return res.status(200).json({
      properties,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-008
 * Consulta el detalle de una propiedad del vendedor.
 */
async function getMyProperty(req, res, next) {
  try {
    const property = await loadOwnedProperty(
      req.params.id,
      req.auth.userId,
      res,
      NOT_OWNER_VIEW_MESSAGE,
    );

    if (!property) {
      return undefined;
    }

    return res.status(200).json({ property });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-008
 * Edita los datos permitidos de una propiedad propia (edición parcial).
 * El propietario y el estado no se pueden cambiar por esta vía.
 */
async function updateProperty(req, res, next) {
  try {
    const property = await loadOwnedProperty(req.params.id, req.auth.userId, res);

    if (!property) {
      return undefined;
    }

    if (property.status === 'withdrawn') {
      return res.status(409).json({ message: WITHDRAWN_MESSAGE });
    }

    const result = updatePropertySchema.safeParse(req.body);

    if (!result.success) {
      return withValidationErrors(res, 'Los datos de la propiedad no son válidos.', result.error);
    }

    const fields = toPropertyUpdate(result.data);

    if (fields.propertyTypeId !== undefined) {
      const propertyType = await propertyRepository.findPropertyTypeById(fields.propertyTypeId);

      if (!propertyType || !propertyType.isActive) {
        return res.status(400).json({
          message: 'El tipo de propiedad seleccionado no es válido.',
        });
      }
    }

    const updated = await propertyRepository.updateProperty(
      property.id,
      String(req.auth.userId),
      fields,
    );

    if (!updated) {
      return res.status(409).json({ message: STATUS_CONFLICT_MESSAGE });
    }

    return res.status(200).json({
      message: 'Propiedad actualizada correctamente.',
      property: updated,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-008
 * Activa o desactiva una propiedad propia. Las inactivas dejan de ser públicas.
 * Cada cambio queda registrado en property_status_history.
 */
async function changePropertyStatus(req, res, next) {
  try {
    const property = await loadOwnedProperty(req.params.id, req.auth.userId, res);

    if (!property) {
      return undefined;
    }

    const result = changeStatusSchema.safeParse(req.body);

    if (!result.success) {
      return withValidationErrors(res, 'El cambio de estado no es válido.', result.error);
    }

    const { status: newStatus, reason } = toStatusChange(result.data);

    if (property.status === 'withdrawn') {
      return res.status(409).json({ message: WITHDRAWN_MESSAGE });
    }

    if (property.status === newStatus) {
      return res.status(409).json({
        message: `La propiedad ya está en estado "${newStatus}".`,
      });
    }

    if (!STATUS_TRANSITIONS[property.status]?.includes(newStatus)) {
      return res.status(409).json({
        message: `No se puede cambiar una propiedad de "${property.status}" a "${newStatus}".`,
      });
    }

    const updated = await propertyRepository.changePropertyStatus({
      propertyId: property.id,
      ownerId: String(req.auth.userId),
      previousStatus: property.status,
      newStatus,
      reason,
    });

    if (!updated) {
      return res.status(409).json({ message: STATUS_CONFLICT_MESSAGE });
    }

    return res.status(200).json({
      message:
        newStatus === 'active'
          ? 'La propiedad está activa y visible en el catálogo.'
          : 'La propiedad se desactivó y ya no aparece en el catálogo.',
      property: updated,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-008
 * Retira una propiedad propia. Es un retiro lógico: la información se conserva
 * (status = 'withdrawn' y withdrawn_at) para trazabilidad; no se borra la fila.
 */
async function withdrawProperty(req, res, next) {
  try {
    const property = await loadOwnedProperty(req.params.id, req.auth.userId, res);

    if (!property) {
      return undefined;
    }

    if (property.status === 'withdrawn') {
      return res.status(409).json({ message: WITHDRAWN_MESSAGE });
    }

    const updated = await propertyRepository.changePropertyStatus({
      propertyId: property.id,
      ownerId: String(req.auth.userId),
      previousStatus: property.status,
      newStatus: 'withdrawn',
      reason: 'Retirada por el propietario',
    });

    if (!updated) {
      return res.status(409).json({ message: STATUS_CONFLICT_MESSAGE });
    }

    return res.status(200).json({
      message: 'La propiedad se retiró correctamente.',
      property: updated,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listMyProperties,
  getMyProperty,
  updateProperty,
  changePropertyStatus,
  withdrawProperty,
  createProperty,
  uploadPhotos,
  saveCharacteristics,
  getCharacteristics,
  getServices,
  saveServices,
};