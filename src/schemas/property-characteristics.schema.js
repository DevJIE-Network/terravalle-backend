const { z } = require('zod');

/**
 * HU-005: validación de dimensiones del terreno y características de construcción.
 *
 * Las reglas viven en una sola función (validateCharacteristics) para que los mensajes
 * sean siempre en español y la lógica condicional (hasConstruction) sea fácil de leer.
 * Zod solo se encarga de exigir un objeto y rechazar campos desconocidos.
 */

const GENERAL_CONDITIONS = ['excelente', 'bueno', 'regular', 'malo'];

const LIMITS = {
  landArea: 10_000_000, // m²
  frontage: 10_000, // m
  depth: 10_000, // m
  builtArea: 10_000_000, // m²
  bedrooms: 50,
  bathrooms: 50,
  floors: 50,
  parkingSpaces: 100,
  constructionAge: 150, // años
};

// La superficie puede ser menor que frente × fondo (terrenos irregulares), pero no mayor.
// Se permite 10 % de holgura por redondeos o medidas aproximadas.
const AREA_TOLERANCE = 1.1;

const CONSTRUCTION_FIELDS = [
  'builtArea',
  'bedrooms',
  'bathrooms',
  'floors',
  'parkingSpaces',
  'constructionAge',
  'generalCondition',
];

// Etiquetas usadas en los mensajes de error.
const LABELS = {
  landArea: 'La superficie del terreno',
  frontage: 'El frente',
  depth: 'El fondo',
  builtArea: 'La superficie construida',
  bedrooms: 'El número de habitaciones',
  bathrooms: 'El número de baños',
  floors: 'El número de pisos',
  parkingSpaces: 'El número de estacionamientos',
  constructionAge: 'La antigüedad',
  generalCondition: 'El estado general',
};

const isAbsent = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** Convierte números o cadenas numéricas; devuelve NaN si el valor no es un número. */
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() === '' ? Number.NaN : Number(value.trim());
  return Number.NaN;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

const hasMoreThanTwoDecimals = (n) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;

function validateCharacteristics(data, ctx) {
  const add = (field, message) => ctx.addIssue({ code: 'custom', path: [field], message });

  // Devuelve el número válido o undefined (y registra el error correspondiente).
  const readArea = (field, { required }) => {
    const raw = data[field];
    if (isAbsent(raw)) {
      if (required) add(field, `${LABELS[field]} es obligatoria.`);
      return undefined;
    }
    const n = toNumber(raw);
    if (!Number.isFinite(n)) {
      add(field, `${LABELS[field]} debe ser un número.`);
      return undefined;
    }
    if (n <= 0) {
      add(field, `${LABELS[field]} debe ser un valor positivo (mayor que cero).`);
      return undefined;
    }
    if (n > LIMITS[field]) {
      add(field, `${LABELS[field]} no puede superar ${LIMITS[field].toLocaleString('en-US')}.`);
      return undefined;
    }
    if (hasMoreThanTwoDecimals(n)) {
      add(field, `${LABELS[field]} admite como máximo dos decimales.`);
      return undefined;
    }
    return n;
  };

  const readInt = (field, { min }) => {
    const raw = data[field];
    if (isAbsent(raw)) {
      add(field, `${LABELS[field]} es obligatorio.`);
      return undefined;
    }
    const n = toNumber(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      add(field, `${LABELS[field]} debe ser un número entero.`);
      return undefined;
    }
    if (n < min) {
      add(
        field,
        min === 0
          ? `${LABELS[field]} no puede ser negativo.`
          : `${LABELS[field]} debe ser al menos ${min}.`,
      );
      return undefined;
    }
    if (n > LIMITS[field]) {
      add(field, `${LABELS[field]} no puede superar ${LIMITS[field]}.`);
      return undefined;
    }
    return n;
  };

  // Baños: NUMERIC(4,1) en la base; se aceptan enteros o medios baños (1, 1.5, 2...).
  const readBathrooms = () => {
    const raw = data.bathrooms;
    if (isAbsent(raw)) {
      add('bathrooms', `${LABELS.bathrooms} es obligatorio.`);
      return;
    }
    const n = toNumber(raw);
    if (!Number.isFinite(n)) {
      add('bathrooms', `${LABELS.bathrooms} debe ser un número.`);
    } else if (n < 0) {
      add('bathrooms', `${LABELS.bathrooms} no puede ser negativo.`);
    } else if (Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) {
      add('bathrooms', `${LABELS.bathrooms} debe ser entero o medio baño (por ejemplo 1 o 1.5).`);
    } else if (n > LIMITS.bathrooms) {
      add('bathrooms', `${LABELS.bathrooms} no puede superar ${LIMITS.bathrooms}.`);
    }
  };

  // ----- Terreno -----
  const landArea = readArea('landArea', { required: true });
  const frontage = readArea('frontage', { required: false });
  const depth = readArea('depth', { required: false });

  if (
    landArea !== undefined &&
    frontage !== undefined &&
    depth !== undefined &&
    landArea > frontage * depth * AREA_TOLERANCE
  ) {
    add(
      'landArea',
      'La superficie del terreno no puede ser mayor que el frente por el fondo '
        + `(${(frontage * depth).toFixed(2)} m²). Revisa las medidas.`,
    );
  }

  // ----- Construcción (condicional) -----
  if (isAbsent(data.hasConstruction)) {
    add('hasConstruction', 'Indica si la propiedad tiene construcción.');
    return;
  }

  const hasConstruction = toBoolean(data.hasConstruction);
  if (hasConstruction === null) {
    add('hasConstruction', 'La indicación de construcción debe ser verdadero o falso.');
    return;
  }

  if (!hasConstruction) {
    // Sin construcción no se exige ni se acepta ningún dato de edificación.
    CONSTRUCTION_FIELDS.filter((field) => !isAbsent(data[field])).forEach((field) => {
      add(field, `${LABELS[field]} no aplica: la propiedad no tiene construcción.`);
    });
    return;
  }

  const builtArea = readArea('builtArea', { required: true });
  readInt('bedrooms', { min: 0 });
  readBathrooms();
  const floors = readInt('floors', { min: 1 });
  readInt('constructionAge', { min: 0 });

  // El estacionamiento es opcional: si no se envía se guarda como 0.
  if (!isAbsent(data.parkingSpaces)) readInt('parkingSpaces', { min: 0 });

  if (isAbsent(data.generalCondition)) {
    add('generalCondition', `${LABELS.generalCondition} es obligatorio.`);
  } else if (!GENERAL_CONDITIONS.includes(data.generalCondition)) {
    add('generalCondition', `El estado general debe ser: ${GENERAL_CONDITIONS.join(', ')}.`);
  }

  if (
    builtArea !== undefined &&
    landArea !== undefined &&
    floors !== undefined &&
    builtArea > landArea * floors
  ) {
    add(
      'builtArea',
      'La superficie construida no puede ser mayor que la del terreno multiplicada por el número de pisos.',
    );
  }
}

const unknownField = z.unknown().optional();

const saveCharacteristicsSchema = z
  .object({
    landArea: unknownField,
    frontage: unknownField,
    depth: unknownField,
    hasConstruction: unknownField,
    builtArea: unknownField,
    bedrooms: unknownField,
    bathrooms: unknownField,
    floors: unknownField,
    parkingSpaces: unknownField,
    constructionAge: unknownField,
    generalCondition: unknownField,
  })
  .strict()
  .superRefine(validateCharacteristics);

/**
 * Convierte un cuerpo YA validado en el registro que se guarda:
 * números reales y null en lo que no aplica (sin construcción todo lo de edificación es null).
 * @param {object} data resultado de saveCharacteristicsSchema.safeParse(...).data
 */
function toCharacteristicsRecord(data) {
  const optionalNumber = (value) => (isAbsent(value) ? null : toNumber(value));
  const hasConstruction = toBoolean(data.hasConstruction);

  const record = {
    landArea: toNumber(data.landArea),
    frontage: optionalNumber(data.frontage),
    depth: optionalNumber(data.depth),
    hasConstruction,
    builtArea: null,
    bedrooms: null,
    bathrooms: null,
    floors: null,
    parkingSpaces: null,
    constructionAge: null,
    generalCondition: null,
  };

  if (hasConstruction) {
    record.builtArea = toNumber(data.builtArea);
    record.bedrooms = toNumber(data.bedrooms);
    record.bathrooms = toNumber(data.bathrooms);
    record.floors = toNumber(data.floors);
    record.parkingSpaces = optionalNumber(data.parkingSpaces) ?? 0;
    record.constructionAge = toNumber(data.constructionAge);
    record.generalCondition = data.generalCondition;
  }

  return record;
}

module.exports = {
  saveCharacteristicsSchema,
  toCharacteristicsRecord,
  GENERAL_CONDITIONS,
  LIMITS,
};
