const express = require('express');

const {
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
} = require('../controllers/property.controller');

const {
  requireAuth,
} = require('../middleware/auth.middleware');

const {
  uploadPropertyPhotos,
} = require('../middleware/property-photo.middleware');

const router = express.Router();

/**
 * HU-004
 * Registrar una nueva propiedad.
 */
router.post(
  '/',
  requireAuth,
  createProperty,
);

/**
 * HU-008
 * Panel del vendedor: consultar sus propiedades.
 * (Se declaran antes de las rutas con :id para que "mine" no se confunda con un id.)
 */
router.get(
  '/mine',
  requireAuth,
  listMyProperties,
);

router.get(
  '/mine/:id',
  requireAuth,
  getMyProperty,
);

/**
 * HU-008
 * Editar datos permitidos, activar/desactivar y retirar una propiedad propia.
 */
router.patch(
  '/:id',
  requireAuth,
  updateProperty,
);

router.patch(
  '/:id/status',
  requireAuth,
  changePropertyStatus,
);

router.delete(
  '/:id',
  requireAuth,
  withdrawProperty,
);

/**
 * HU-020
 * Subir fotografías de una propiedad.
 */
router.post(
  '/:propertyId/photos',
  requireAuth,
  uploadPropertyPhotos.array(
    'photos',
    10,
  ),
  uploadPhotos,
);

/**
 * HU-005
 * Consultar dimensiones y características
 * de una propiedad.
 */
router.get(
  '/:id/characteristics',
  requireAuth,
  getCharacteristics,
);

/**
 * HU-005
 * Registrar o actualizar dimensiones
 * y características de una propiedad.
 */
router.put(
  '/:id/characteristics',
  requireAuth,
  saveCharacteristics,
);

/**
 * HU-006
 * Consultar los servicios disponibles
 * registrados en una propiedad.
 */
router.get(
  '/:id/services',
  requireAuth,
  getServices,
);

/**
 * HU-006
 * Registrar o actualizar los servicios
 * disponibles en una propiedad.
 */
router.put(
  '/:id/services',
  requireAuth,
  saveServices,
);

module.exports = router;