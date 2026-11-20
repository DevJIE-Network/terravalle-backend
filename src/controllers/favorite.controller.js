const favoriteRepository = require('../repositories/favorite.repository');

/**
 * HU-014 · Agrega una propiedad activa a favoritos.
 * Validaciones (todas vienen del middleware requireAuth + params):
 *   1. propertyId válido (isValidId del repository)
 *   2. Propiedad existente en BD
 *   3. Propiedad status = 'active'
 *   4. Propiedad no eliminada (deletedAt IS NULL)
 *   5. Evita duplicados usando constraint UNIQUE de BD (handled por repository)
 *   6. Idempotente: 201 si created===true, 200 si created===false
 */
async function addFavoriteToProperty(req, res, next) {
  try {
    const { propertyId } = req.params;
    const userId = req.auth.userId;

    if (!propertyId) {
      return res.status(400).json({
        message: 'El identificador de propiedad es obligatorio.',
      });
    }

    // 1. Validar que la propiedad existe, está activa y no está eliminada
    // Usar findPropertyById del repository (sin Number(), el ID viene validado por ruta)
    const property = await favoriteRepository.findPropertyById(propertyId);

    if (!property) {
      return res.status(404).json({
        message: 'Propiedad no encontrada.',
      });
    }

    // 2. Verificar que la propiedad esté activa y no eliminada
    // El repository ya filtra deleted_at IS NULL y status activo en findPropertyById
    if (property.status !== 'active' || property.deletedAt !== null) {
      return res.status(400).json({
        message:
          'No se pueden favorear propiedades inactivas, retiradas o borradas.',
      });
    }

    // 3. Agregar a favoritos (idempotente mediante constraint UNIQUE de BD)
    // favoriteRepository.addFavorite retorna { created: true/false, favorite }
    const result = await favoriteRepository.addFavorite(
      userId,
      propertyId
    );

    if (result.created) {
      // Primera creación → 201
      return res.status(201).json({
        message: 'Propiedad agregada a favoritos.',
        propertyId: propertyId,
        favoriteId: result.favorite.id,
        created: true,
      });
    }

    // Ya existía → 200 (idempotente)
    return res.status(200).json({
      message: 'La propiedad ya estaba en favoritos.',
      propertyId: propertyId,
      favoriteId: result.favorite.id,
      created: false,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-014 · Consulta los favoritos del usuario autenticado.
 * Solo muestra propiedades active y no eliminadas.
 * Orden: created_at DESC, id DESC (desempate determinista).
 * El controller entrega array directo de favorites; el route monta { favorites }.
 */
async function listFavorites(req, res, next) {
  try {
    const userId = req.auth.userId;

    const favorites = await favoriteRepository.getFavoritesByUser(userId);

    return res.status(200).json({
      favorites,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-014 · Elimina una relación de favorito.
 * Solo elimina la relación usuario-propiedad.
 * No modifica la propiedad, su estado, vendedor ni favoritos de otros usuarios.
 * Comportamiento idempotente: si ya no existe, responde 200.
 */
async function removeFavoriteFromProperty(req, res, next) {
  try {
    const { propertyId } = req.params;
    const userId = req.auth.userId;

    if (!propertyId) {
      return res.status(400).json({
        message: 'El identificador de propiedad es obligatorio.',
      });
    }

    const deleted = await favoriteRepository.removeFavorite(
      userId,
      propertyId
    );

    if (deleted) {
      return res.status(200).json({
        message: 'Favorito eliminado correctamente.',
        propertyId: propertyId,
      });
    }

    // Si no se eliminó nada, el favorito ya no existía → idempotente 200
    return res.status(200).json({
      message: 'El favorito ya no existía.',
      propertyId: propertyId,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Verifica que el ID sea un string válido formato BIGINT PostgreSQL.
 * No convertimos a Number para evitar pérdida de precisión.
 * Solo validamos el formato de cadena numérica positiva.
 */
function isValidId(id) {
  if (typeof id !== 'string') {
    return false;
  }
  return /^[1-9]\d{0,18}$/.test(id);
}

module.exports = {
  addFavoriteToProperty,
  listFavorites,
  removeFavoriteFromProperty,
  isValidId,
};