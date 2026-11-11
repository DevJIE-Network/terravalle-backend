const propertyDetailRepository = require('../repositories/property-detail.repository');
const { isValidId } = require('../repositories/property.repository');

/**
 * HU-012 · Consultar ficha detallada de una propiedad.
 *
 * GET /api/properties/:id (público, no requiere sesión)
 *   200 → { property, notes }        publicación activa
 *   404 → { message }                no existe, fue eliminada o nunca se publicó (borrador)
 *   410 → { message, available }     estaba publicada pero se desactivó o se retiró
 */

const NOT_FOUND_MESSAGE = 'La propiedad no existe o no está publicada.';
const UNAVAILABLE_MESSAGE = 'Esta publicación ya no está disponible.';

// Estados que alguna vez estuvieron publicados y ya no se presentan como disponibles.
const UNAVAILABLE_STATUSES = new Set(['inactive', 'withdrawn']);

// Textos para que el cliente distinga el precio del vendedor de la estimación y
// rotule las distancias (reglas de negocio de HU-012, HU-007 y HU-009).
const NOTES = {
  publicationPrice: 'Precio vigente definido por el vendedor.',
  estimate:
    'Estimación orientativa generada con IA. No es el precio de venta ni un avalúo oficial.',
  nearbyPlaces: 'Las distancias son aproximadas.',
};

async function getPublicProperty(req, res, next) {
  try {
    const { id } = req.params;

    // Un id mal formado no puede identificar una propiedad: misma respuesta que inexistente.
    if (!isValidId(id)) {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const row = await propertyDetailRepository.findPropertyForDetail(id);

    if (!row || row.status === 'draft') {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    if (UNAVAILABLE_STATUSES.has(row.status)) {
      return res.status(410).json({ message: UNAVAILABLE_MESSAGE, available: false });
    }

    if (row.status !== 'active') {
      return res.status(404).json({ message: NOT_FOUND_MESSAGE });
    }

    const relations = await propertyDetailRepository.findDetailRelations(id);

    return res.status(200).json({
      property: propertyDetailRepository.toPropertyDetail(row, relations),
      notes: NOTES,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getPublicProperty,
  NOT_FOUND_MESSAGE,
  UNAVAILABLE_MESSAGE,
  NOTES,
};
