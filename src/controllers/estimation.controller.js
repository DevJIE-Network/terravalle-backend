const estimationService = require('../services/estimation/estimation.service');
const { DISCLAIMER } = require('../services/estimation/valuation-model');
const { loadOwnedProperty, NOT_OWNER_VIEW_MESSAGE } = require('./property.controller');

const NOT_OWNER_ESTIMATE_MESSAGE = 'No tienes permiso para estimar el valor de esta propiedad.';
const WITHDRAWN_MESSAGE = 'No se puede estimar el valor de una propiedad retirada.';
const MISSING_DATA_MESSAGE = 'Faltan datos de la propiedad para estimar su valor.';
const PRICE_NOTE =
  'La estimación no modifica el precio de publicación; puedes definir un precio final distinto.';

/**
 * HU-009 · POST /api/properties/:id/estimations
 * Solicita una estimación orientativa del valor de una propiedad propia.
 */
async function requestEstimation(req, res, next) {
  try {
    const property = await loadOwnedProperty(
      req.params.id,
      req.auth.userId,
      res,
      NOT_OWNER_ESTIMATE_MESSAGE,
    );
    if (!property) return undefined;

    if (property.status === 'withdrawn') {
      return res.status(409).json({ message: WITHDRAWN_MESSAGE });
    }

    const result = await estimationService.requestEstimation({
      property,
      userId: req.auth.userId,
    });

    // CA2: faltan datos indispensables.
    if (result.missing) {
      return res.status(422).json({ message: MISSING_DATA_MESSAGE, missing: result.missing });
    }

    // CA1, CA3 y CA4.
    return res.status(201).json({
      message: 'Estimación generada correctamente.',
      estimation: result.estimation,
      publicationPrice: property.publicationPrice,
      note: PRICE_NOTE,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * HU-009 · GET /api/properties/:id/estimations
 * Historial de estimaciones de una propiedad propia (la más reciente primero).
 */
async function listEstimations(req, res, next) {
  try {
    const property = await loadOwnedProperty(
      req.params.id,
      req.auth.userId,
      res,
      NOT_OWNER_VIEW_MESSAGE,
    );
    if (!property) return undefined;

    const estimations = await estimationService.listEstimations(property.id);
    return res.status(200).json({ estimations, disclaimer: DISCLAIMER });
  } catch (error) {
    return next(error);
  }
}

module.exports = { requestEstimation, listEstimations };
