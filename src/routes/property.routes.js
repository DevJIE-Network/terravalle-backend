const express = require('express');

const {
  createProperty,
  uploadPhotos,
  saveCharacteristics,
  getCharacteristics,

  getLocation,
  saveLocation,
  getNearbyPlaceCategories,
  getNearbyPlaces,
  addNearbyPlace,
  removeNearbyPlace,
} = require(
  '../controllers/property.controller',
);

const {
  requireAuth,
} = require(
  '../middleware/auth.middleware',
);

const {
  uploadPropertyPhotos,
} = require(
  '../middleware/property-photo.middleware',
);

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
 * HU-007
 * Consultar catálogo de categorías
 * de puntos cercanos.
 *
 * IMPORTANTE:
 * Esta ruta va antes de las rutas /:id/...
 * para evitar que Express interprete
 * "nearby-place-categories" como un id.
 */
router.get(
  '/nearby-place-categories',
  requireAuth,
  getNearbyPlaceCategories,
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
 * HU-007
 * Consultar la ubicación principal
 * de una propiedad.
 */
router.get(
  '/:id/location',
  requireAuth,
  getLocation,
);

/**
 * HU-007
 * Registrar o actualizar la ubicación
 * principal de una propiedad.
 */
router.put(
  '/:id/location',
  requireAuth,
  saveLocation,
);

/**
 * HU-007
 * Consultar los puntos de interés
 * cercanos de una propiedad.
 */
router.get(
  '/:id/nearby-places',
  requireAuth,
  getNearbyPlaces,
);

/**
 * HU-007
 * Registrar manualmente un punto
 * de interés cercano.
 */
router.post(
  '/:id/nearby-places',
  requireAuth,
  addNearbyPlace,
);

/**
 * HU-007
 * Eliminar un punto de interés
 * cercano asociado a una propiedad.
 */
router.delete(
  '/:id/nearby-places/:placeId',
  requireAuth,
  removeNearbyPlace,
);

module.exports = router;