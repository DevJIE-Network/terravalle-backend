const propertyRepository = require('../../repositories/property.repository');
const serviceRepository = require('../../repositories/service.repository');
const estimationRepository = require('../../repositories/estimation.repository');
const aiExplainer = require('./ai-explainer');
const model = require('./valuation-model');

/**
 * HU-009 · Orquesta la estimación: reúne los datos de HU-005, HU-006 y HU-007, valida los
 * mínimos, calcula el valor con el modelo propio, pide la explicación a la IA (si está
 * configurada) y guarda el resultado con fecha y versión del modelo para trazabilidad.
 */

/** Agrega los datos fijos que siempre acompañan a una estimación (RN1). */
function present(estimation) {
  return {
    ...estimation,
    currency: model.CURRENCY,
    isOfficialAppraisal: false,
    disclaimer: model.DISCLAIMER,
  };
}

async function gatherInput(property) {
  const [propertyType, characteristics, location, services, nearbyPlaces] = await Promise.all([
    propertyRepository.findPropertyTypeById(property.propertyTypeId),
    propertyRepository.findCharacteristicsByPropertyId(property.id),
    propertyRepository.findLocationByPropertyId(property.id),
    serviceRepository.findServicesByPropertyId(property.id),
    propertyRepository.findNearbyPlacesByPropertyId(property.id),
  ]);

  return { propertyType, characteristics, location, services, nearbyPlaces };
}

/**
 * @returns {Promise<{ missing: object[] } | { estimation: object }>}
 */
async function requestEstimation({ property, userId }) {
  const input = await gatherInput(property);

  // CA2: se informa qué falta antes de calcular.
  const missing = model.findMissingData(input);
  if (missing.length > 0) {
    return { missing };
  }

  const { location } = input;
  const hasCoordinates = location.latitude != null && location.longitude != null;

  const [referencePrice, comparables] = await Promise.all([
    estimationRepository.findReferencePrice({
      state: location.state,
      municipality: location.municipality,
      postalCode: location.postalCode ?? null,
    }),
    estimationRepository.findComparables({
      propertyId: property.id,
      propertyTypeId: property.propertyTypeId,
      municipality: location.municipality,
      state: location.state,
      latitude: hasCoordinates ? location.latitude : null,
      longitude: hasCoordinates ? location.longitude : null,
      radiusM: model.COMPARABLE_RADIUS_M,
    }),
  ]);

  const result = model.estimateValue({
    ...input,
    referencePrice,
    comparables,
    comparablesByRadius: hasCoordinates,
  });

  // La IA solo redacta; las cifras y factores vienen del modelo.
  const ai = await aiExplainer.explainWithAi({
    propertyType: input.propertyType?.name ?? null,
    municipality: input.location.municipality,
    state: input.location.state,
    estimatedValue: result.estimatedValue,
    estimatedMin: result.estimatedMin,
    estimatedMax: result.estimatedMax,
    currency: result.currency,
    factors: result.factors,
  });

  const estimation = await estimationRepository.createEstimation({
    propertyId: property.id,
    requestedBy: userId,
    estimatedValue: result.estimatedValue,
    estimatedMin: result.estimatedMin,
    estimatedMax: result.estimatedMax,
    explanation: ai?.text ?? model.buildExplanation({ ...input, result }),
    modelName: model.MODEL_NAME,
    modelVersion: ai ? `${model.MODEL_VERSION}+ai:${ai.model}` : model.MODEL_VERSION,
    factors: result.factors,
  });

  return { estimation: present(estimation) };
}

async function listEstimations(propertyId) {
  const estimations = await estimationRepository.findEstimationsByPropertyId(propertyId);
  return estimations.map(present);
}

module.exports = { requestEstimation, listEstimations, present };
