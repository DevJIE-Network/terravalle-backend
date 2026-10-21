const express = require('express');

const {
  createProperty,
  uploadPhotos,
  saveCharacteristics,
  getCharacteristics,
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

module.exports = router;