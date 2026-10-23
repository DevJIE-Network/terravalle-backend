const express = require('express');

const {
  // HU-008
  listMyProperties,
  getMyProperty,
  updateProperty,
  changePropertyStatus,
  withdrawProperty,

  // HU-004
  createProperty,

  // HU-020
  uploadPhotos,

  // HU-005
  saveCharacteristics,
  getCharacteristics,

  // HU-006
  getServices,
  saveServices,

  // HU-007
  getLocation,
  saveLocation,
  getNearbyPlaceCategories,
  getNearbyPlaces,
  addNearbyPlace,
  removeNearbyPlace,
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
 * Consultar las propiedades
 * del vendedor autenticado.
 */
router.get(
  '/mine',
  requireAuth,
  listMyProperties,
);

/**
 * HU-008
 * Consultar una propiedad propia.
 */
router.get(
  '/mine/:id',
  requireAuth,
  getMyProperty,
);

/**
 * HU-007
 * Catálogo de categorías
 * de puntos cercanos.
 *
 * Debe ir antes de las rutas /:id.
 */
router.get(
  '/nearby-place-categories',
  requireAuth,
  getNearbyPlaceCategories,
);

/**
 * HU-008
 * Editar una propiedad propia.
 */
router.patch(
  '/:id',
  requireAuth,
  updateProperty,
);

/**
 * HU-008
 * Activar o desactivar propiedad.
 */
router.patch(
  '/:id/status',
  requireAuth,
  changePropertyStatus,
);

/**
 * HU-008
 * Retirar una propiedad.
 */
router.delete(
  '/:id',
  requireAuth,
  withdrawProperty,
);

/**
 * HU-020
 * Subir fotografías.
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
 * Consultar características.
 */
router.get(
  '/:id/characteristics',
  requireAuth,
  getCharacteristics,
);

/**
 * HU-005
 * Registrar o actualizar características.
 */
router.put(
  '/:id/characteristics',
  requireAuth,
  saveCharacteristics,
);

/**
 * HU-006
 * Consultar servicios.
 */
router.get(
  '/:id/services',
  requireAuth,
  getServices,
);

/**
 * HU-006
 * Registrar o actualizar servicios.
 */
router.put(
  '/:id/services',
  requireAuth,
  saveServices,
);

/**
 * HU-007
 * Consultar ubicación.
 */
router.get(
  '/:id/location',
  requireAuth,
  getLocation,
);

/**
 * HU-007
 * Registrar o actualizar ubicación.
 */
router.put(
  '/:id/location',
  requireAuth,
  saveLocation,
);

/**
 * HU-007
 * Consultar puntos cercanos.
 */
router.get(
  '/:id/nearby-places',
  requireAuth,
  getNearbyPlaces,
);

/**
 * HU-007
 * Registrar punto cercano.
 */
router.post(
  '/:id/nearby-places',
  requireAuth,
  addNearbyPlace,
);

/**
 * HU-007
 * Eliminar punto cercano.
 */
router.delete(
  '/:id/nearby-places/:placeId',
  requireAuth,
  removeNearbyPlace,
);

module.exports = router;