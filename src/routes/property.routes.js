const express = require('express');

const {
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