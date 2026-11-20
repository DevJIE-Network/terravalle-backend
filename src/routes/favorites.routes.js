const { Router } = require('express');
const {
  addFavoriteToProperty,
  listFavorites,
  removeFavoriteFromProperty,
} = require('../controllers/favorite.controller');

const { requireAuth } = require('../middleware/auth.middleware');

const router = Router();

/**
 * HU-014
 * Agrega una propiedad activa a favoritos del usuario autenticado.
 * POST /api/favorites/:propertyId
 * Requiere autenticación.
 */
router.post(
  '/:propertyId',
  requireAuth,
  addFavoriteToProperty,
);

/**
 * HU-014
 * Lista los favoritos del usuario autenticado.
 * GET /api/favorites
 * Requiere autenticación.
 */
router.get(
  '/',
  requireAuth,
  listFavorites,
);

/**
 * HU-014
 * Elimina una propiedad de favoritos del usuario autenticado.
 * DELETE /api/favorites/:propertyId
 * Requiere autenticación.
 */
router.delete(
  '/:propertyId',
  requireAuth,
  removeFavoriteFromProperty,
);

module.exports = router;