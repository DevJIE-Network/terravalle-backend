/**
 * HU-009 · Modelo de valuación orientativa de TerraValle.
 *
 * Modelo hedónico explicable:
 *  1. Valor base con precios de referencia por m² (terreno y construcción) de la zona más
 *     específica disponible (código postal → municipio → estado → referencia nacional).
 *  2. Ajustes por tipo de inmueble, calidad, estado, antigüedad, distribución, servicios y entorno.
 *  3. Combinación con propiedades comparables cercanas, ponderadas por distancia y similitud.
 *
 * Funciones puras: no consultan la base de datos ni servicios externos (fácil de probar).
 */

const MODEL_NAME = 'terravalle-valuador';
const MODEL_VERSION = '1.1.0';
const CURRENCY = 'MXN';

const DISCLAIMER =
  'Estimación orientativa generada automáticamente. No es un avalúo oficial ni garantiza el ' +
  'precio de venta; el precio final de publicación lo decide el vendedor.';

// Referencia nacional (MXN por m²) cuando la zona no tiene precios registrados.
const NATIONAL_REFERENCE = {
  landPriceM2: 2500,
  constructionPriceM2: 9000,
  level: 'national',
  source: 'Referencia nacional de TerraValle',
};

const LEVEL_LABELS = {
  postal_code: 'código postal',
  municipality: 'municipio',
  state: 'estado',
  national: 'referencia nacional',
};

// Multiplicador del costo de construcción según su calidad (media = referencia).
const QUALITY_FACTORS = { economica: 0.7, media: 1, residencial: 1.45, lujo: 2.1 };
const QUALITY_LABELS = { economica: 'económica', media: 'media', residencial: 'residencial', lujo: 'lujo' };
const DEFAULT_QUALITY = 'media';

const CONDITION_FACTORS = { excelente: 1.1, bueno: 1, regular: 0.85, malo: 0.65 };
const DEPRECIATION_PER_YEAR = 0.012;
const MAX_DEPRECIATION = 0.45;

const BASIC_SERVICES = ['agua potable', 'electricidad', 'drenaje'];
const NEARBY_CATEGORIES = ['escuela', 'hospital', 'farmacia', 'supermercado', 'parque', 'banco', 'transporte'];
const NEARBY_MAX_DISTANCE_M = 1500;

const MIN_COMPARABLES = 3;
const COMPARABLE_RADIUS_M = 2000;

/** Texto en minúsculas y sin acentos para comparar nombres. */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

const percent = (value) => `${value > 0 ? '+' : ''}${Math.round(value * 1000) / 10} %`;
const impactOf = (value) => {
  if (value > 0.0001) return 'positive';
  if (value < -0.0001) return 'negative';
  return 'neutral';
};
const roundTo = (value, step) => Math.round(value / step) * step;
const money = (value) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(value);
const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Mediana ponderada: el valor donde se acumula la mitad del peso total. */
function weightedMedian(items) {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((sum, item) => sum + item.weight, 0) / 2;
  let accumulated = 0;
  for (const item of sorted) {
    accumulated += item.weight;
    if (accumulated >= half) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

/**
 * CA2 · Datos indispensables que faltan para estimar.
 * @returns {{ field: string, section: string, message: string }[]}
 */
function findMissingData({ characteristics, location }) {
  const missing = [];

  if (!characteristics || !isPositive(characteristics.landArea)) {
    missing.push({
      field: 'characteristics',
      section: 'Dimensiones y construcción',
      message: 'Registra la superficie del terreno y las características del inmueble.',
    });
  } else if (characteristics.hasConstruction && !isPositive(characteristics.builtArea)) {
    missing.push({
      field: 'builtArea',
      section: 'Dimensiones y construcción',
      message: 'Registra la superficie construida.',
    });
  }

  if (!location?.municipality?.trim() || !location?.state?.trim()) {
    missing.push({
      field: 'location',
      section: 'Ubicación',
      message: 'Registra el municipio y el estado de la propiedad.',
    });
  }

  return missing;
}

/** Área que se usa para comparar precios por m² entre propiedades. */
function comparableArea({ hasConstruction, builtArea, landArea }) {
  return hasConstruction && isPositive(builtArea) ? builtArea : landArea;
}

const qualityOf = (characteristics) => {
  const quality = normalize(characteristics?.constructionQuality);
  return QUALITY_FACTORS[quality] ? quality : null;
};

function baseValue({ propertyType, characteristics, reference }) {
  const type = normalize(propertyType?.name);
  const { landArea, hasConstruction, builtArea, generalCondition, constructionAge } = characteristics;

  // En departamentos el terreno es indiviso: se considera una fracción.
  const landShare = type === 'departamento' ? 0.3 : 1;
  const landValue = landArea * landShare * reference.landPriceM2;

  if (!hasConstruction || type === 'terreno') {
    return { landValue, constructionValue: 0 };
  }

  const quality = qualityOf(characteristics) ?? DEFAULT_QUALITY;
  const qualityFactor = QUALITY_FACTORS[quality];
  const conditionFactor = CONDITION_FACTORS[normalize(generalCondition)] ?? 1;
  const depreciation = Math.min((constructionAge ?? 0) * DEPRECIATION_PER_YEAR, MAX_DEPRECIATION);
  const constructionValue =
    builtArea * reference.constructionPriceM2 * qualityFactor * conditionFactor * (1 - depreciation);

  return { landValue, constructionValue, quality, qualityFactor, conditionFactor, depreciation };
}

function distributionAdjustment({ hasConstruction, bedrooms, bathrooms, parkingSpaces }) {
  if (!hasConstruction) return 0;
  const extraBedrooms = Math.min(Math.max((bedrooms ?? 0) - 2, 0) * 0.015, 0.045);
  const extraBathrooms = Math.min(Math.max((bathrooms ?? 0) - 1, 0) * 0.02, 0.04);
  const parking = Math.min((parkingSpaces ?? 0) * 0.02, 0.04);
  return extraBedrooms + extraBathrooms + parking;
}

function servicesAdjustment(services) {
  const names = services.map((service) => normalize(service.name));
  const missingBasics = BASIC_SERVICES.filter((basic) => !names.includes(basic));
  const extras = names.filter((name) => !BASIC_SERVICES.includes(name)).length;
  return {
    value: -0.04 * missingBasics.length + Math.min(extras * 0.01, 0.05),
    missingBasics,
    count: names.length,
  };
}

function surroundingsAdjustment(nearbyPlaces) {
  const close = new Set(
    nearbyPlaces
      .filter(
        (place) =>
          place.approximateDistanceM === null ||
          place.approximateDistanceM === undefined ||
          place.approximateDistanceM <= NEARBY_MAX_DISTANCE_M,
      )
      .map((place) => normalize(place.category?.name))
      .filter((name) => NEARBY_CATEGORIES.includes(name)),
  );
  return { value: Math.min(close.size * 0.01, 0.05), categories: [...close] };
}

/**
 * Precio por m² de cada comparable válido con su peso:
 * más cercano y más parecido (superficie y calidad) pesa más.
 */
function weightedComparables(comparables, characteristics) {
  const subjectArea = comparableArea(characteristics);
  const subjectQuality = qualityOf(characteristics);

  return comparables
    .filter((item) => isPositive(item.publicationPrice) && isPositive(comparableArea(item)))
    .map((item) => {
      const area = comparableArea(item);
      const distanceWeight = isPositive(item.distanceM) ? 1 / (1 + item.distanceM / 500) : 0.5;
      const areaWeight = Math.min(area, subjectArea) / Math.max(area, subjectArea);
      const itemQuality = qualityOf(item);
      const qualityWeight = !subjectQuality || !itemQuality || itemQuality === subjectQuality ? 1 : 0.6;
      return {
        value: item.publicationPrice / area,
        weight: distanceWeight * areaWeight * qualityWeight,
      };
    });
}

function uncertaintyFor({ comparablesUsed, servicesCount, nearbyCount, referenceLevel, qualityKnown }) {
  let margin = 0.18;
  if (comparablesUsed >= 5) margin = 0.08;
  else if (comparablesUsed >= MIN_COMPARABLES) margin = 0.1;
  if (servicesCount === 0) margin += 0.02;
  if (nearbyCount === 0) margin += 0.02;
  if (referenceLevel === 'national') margin += 0.04;
  if (!qualityKnown) margin += 0.03;
  return Math.round(Math.min(margin, 0.3) * 100) / 100;
}

function locationFactor(location, reference) {
  const place = `${location.municipality}, ${location.state}`;
  const effect = reference.landPriceM2 / NATIONAL_REFERENCE.landPriceM2 - 1;
  return {
    name: 'Ubicación',
    value: `${place} · ${LEVEL_LABELS[reference.level] ?? reference.level}`,
    impact: impactOf(effect),
    explanation:
      reference.level === 'national'
        ? 'No hay precios de referencia registrados para la zona; se usó la referencia nacional.'
        : `Terreno a ${money(reference.landPriceM2)}/m² y construcción a ${money(reference.constructionPriceM2)}/m² ` +
          `(${LEVEL_LABELS[reference.level]}; fuente: ${reference.source}).`,
  };
}

function constructionFactors(characteristics, base) {
  if (base.constructionValue <= 0) return [];
  const known = Boolean(qualityOf(characteristics));
  const conditionEffect = base.conditionFactor * (1 - base.depreciation) - 1;

  return [
    {
      name: 'Construcción',
      value: `${characteristics.builtArea} m²`,
      impact: 'positive',
      explanation: `Aporta ${money(base.constructionValue)} al valor base.`,
    },
    {
      name: 'Calidad de la construcción',
      value: known ? QUALITY_LABELS[base.quality] : 'Sin dato (se asumió media)',
      impact: impactOf(base.qualityFactor - 1),
      explanation: known
        ? `El costo de construcción por m² se ajustó ${percent(base.qualityFactor - 1)} por la calidad.`
        : 'Registra la calidad de la construcción para una estimación más precisa.',
    },
    {
      name: 'Estado y antigüedad',
      value: `${characteristics.generalCondition ?? 'sin dato'} · ${characteristics.constructionAge ?? 0} años`,
      impact: impactOf(conditionEffect),
      explanation: `El valor de la construcción se ajustó ${percent(conditionEffect)} por su estado general y depreciación.`,
    },
  ];
}

function comparablesFactor({ weighted, total, comparableValue, modelValue, weight, byRadius, location }) {
  const scope = byRadius
    ? `a menos de ${COMPARABLE_RADIUS_M / 1000} km`
    : `en ${location.municipality}, ${location.state}`;

  if (weighted.length < MIN_COMPARABLES) {
    return {
      name: 'Propiedades comparables',
      value: `${total} ${total === 1 ? 'disponible' : 'disponibles'} ${scope}`,
      impact: 'neutral',
      explanation: `Se requieren al menos ${MIN_COMPARABLES} comparables publicados; el rango es más amplio.`,
    };
  }

  return {
    name: 'Propiedades comparables',
    value: `${weighted.length} ${scope}`,
    impact: impactOf(comparableValue - modelValue),
    explanation:
      `La mediana ponderada de ${money(weightedMedian(weighted))} por m² (por distancia y similitud) ` +
      `pesa ${weight * 100} % en el resultado.`,
  };
}

/**
 * CA1 · Calcula el valor y el rango orientativos con sus factores relevantes.
 * Requiere que findMissingData(input) no devuelva faltantes.
 */
function estimateValue({
  propertyType,
  characteristics,
  location,
  referencePrice = null,
  services = [],
  nearbyPlaces = [],
  comparables = [],
  comparablesByRadius = false,
}) {
  const reference = referencePrice ?? NATIONAL_REFERENCE;
  const base = baseValue({ propertyType, characteristics, reference });

  const factors = [
    locationFactor(location, reference),
    {
      name: 'Superficie del terreno',
      value: `${characteristics.landArea} m²`,
      impact: 'neutral',
      explanation: `Aporta ${money(base.landValue)} al valor base.`,
    },
    ...constructionFactors(characteristics, base),
  ];

  const distribution = distributionAdjustment(characteristics);
  if (distribution > 0) {
    factors.push({
      name: 'Distribución',
      value: `${characteristics.bedrooms ?? 0} recámaras · ${characteristics.bathrooms ?? 0} baños · ${characteristics.parkingSpaces ?? 0} estacionamientos`,
      impact: 'positive',
      explanation: `Recámaras, baños y estacionamientos adicionales suman ${percent(distribution)}.`,
    });
  }

  const servicesInfo = servicesAdjustment(services);
  factors.push({
    name: 'Servicios',
    value: `${servicesInfo.count} registrados`,
    impact: impactOf(servicesInfo.value),
    explanation: servicesInfo.missingBasics.length
      ? `Faltan servicios básicos (${servicesInfo.missingBasics.join(', ')}); ajuste ${percent(servicesInfo.value)}.`
      : `Cuenta con los servicios básicos; ajuste ${percent(servicesInfo.value)}.`,
  });

  const surroundings = surroundingsAdjustment(nearbyPlaces);
  factors.push({
    name: 'Entorno',
    value: surroundings.categories.length ? surroundings.categories.join(', ') : 'Sin puntos registrados',
    impact: impactOf(surroundings.value),
    explanation: surroundings.categories.length
      ? `Puntos de interés a menos de ${NEARBY_MAX_DISTANCE_M} m; ajuste ${percent(surroundings.value)}.`
      : 'No se registraron puntos de interés cercanos; no se aplicó ajuste.',
  });

  const modelValue =
    (base.landValue + base.constructionValue) * (1 + distribution + servicesInfo.value + surroundings.value);

  const weighted = weightedComparables(comparables, characteristics);
  const enough = weighted.length >= MIN_COMPARABLES;
  const comparableValue = enough ? weightedMedian(weighted) * comparableArea(characteristics) : null;
  const weight = weighted.length >= 5 ? 0.5 : 0.4;
  const estimated = enough ? modelValue * (1 - weight) + comparableValue * weight : modelValue;

  factors.push(
    comparablesFactor({
      weighted,
      total: weighted.length,
      comparableValue,
      modelValue,
      weight,
      byRadius: comparablesByRadius,
      location,
    }),
  );

  const margin = uncertaintyFor({
    comparablesUsed: enough ? weighted.length : 0,
    servicesCount: servicesInfo.count,
    nearbyCount: nearbyPlaces.length,
    referenceLevel: reference.level,
    qualityKnown: !characteristics.hasConstruction || Boolean(qualityOf(characteristics)),
  });

  return {
    estimatedValue: roundTo(estimated, 1000),
    estimatedMin: roundTo(estimated * (1 - margin), 1000),
    estimatedMax: roundTo(estimated * (1 + margin), 1000),
    margin,
    currency: CURRENCY,
    comparablesUsed: enough ? weighted.length : 0,
    referenceLevel: reference.level,
    factors,
  };
}

/** Explicación en lenguaje natural sin servicios externos. */
function buildExplanation({ propertyType, location, result }) {
  const relevant = result.factors
    .filter((factor) => factor.impact !== 'neutral')
    .map((factor) => factor.name.toLowerCase());
  const drivers = relevant.length ? relevant.join(', ') : 'la superficie y la ubicación';

  return (
    `Valor orientativo de ${money(result.estimatedValue)} (rango de ${money(result.estimatedMin)} a ` +
    `${money(result.estimatedMax)}) para ${normalize(propertyType?.name) || 'la propiedad'} en ` +
    `${location.municipality}, ${location.state}. Los factores que más influyeron fueron: ${drivers}. ` +
    `El rango es de ±${Math.round(result.margin * 100)} % según la información y los comparables disponibles. ` +
    'No sustituye un avalúo profesional.'
  );
}

module.exports = {
  MODEL_NAME,
  MODEL_VERSION,
  CURRENCY,
  DISCLAIMER,
  NATIONAL_REFERENCE,
  QUALITY_FACTORS,
  COMPARABLE_RADIUS_M,
  normalize,
  weightedMedian,
  findMissingData,
  estimateValue,
  buildExplanation,
};
