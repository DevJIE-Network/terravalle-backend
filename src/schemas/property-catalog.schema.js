const { z } = require('zod');

function paginationInteger(defaultValue, maximum, message) {
  return z.preprocess(
    (value) => (
      typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
    ),
    z.number({ error: message }).int(message).min(1, message).max(maximum, message),
  ).default(defaultValue);
}

/**
 * HU-011: límites de los filtros. Coinciden con la base de datos y con HU-005:
 * publication_price NUMERIC(14,2) y superficies hasta 10,000,000 m².
 */
const FILTER_LIMITS = {
  price: 999_999_999_999.99,
  area: 10_000_000,
  text: 120,
  search: 100,
  propertyTypeId: 32_767,
  serviceId: 32_767,
  serviceIds: 30,
};

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const INTEGER_PATTERN = /^\d+$/;

const isBlank = (value) => (
  value === undefined
  || value === null
  || (typeof value === 'string' && value.trim() === '')
);

/**
 * Lee un filtro opcional. Los valores vacíos significan "sin filtro" (así se limpia
 * un campo del panel). Cada lector devuelve el valor normalizado o undefined, y registra
 * el error en `issues` cuando el valor no es válido.
 */
function createReaders(issues) {
  const fail = (field, message) => {
    issues.push({ field, message });
    return undefined;
  };

  const single = (field, value, label) => {
    if (Array.isArray(value)) return fail(field, `${label} no puede enviarse más de una vez.`);
    if (typeof value === 'object') return fail(field, `${label} no es válido.`);
    return value;
  };

  const amount = (field, value, label, max) => {
    if (isBlank(value)) return undefined;
    const raw = single(field, value, label);
    if (raw === undefined) return undefined;

    const text = typeof raw === 'string' ? raw.trim() : raw;
    if (typeof text === 'boolean') return fail(field, `${label} debe ser un número.`);

    const number = typeof text === 'number' ? text : Number(DECIMAL_PATTERN.test(text) ? text : Number.NaN);
    if (!Number.isFinite(number)) {
      return fail(
        field,
        typeof text === 'string' && /^-\d/.test(text)
          ? `${label} no puede ser negativo.`
          : `${label} debe ser un número.`,
      );
    }
    if (number < 0) return fail(field, `${label} no puede ser negativo.`);
    if (number > max) return fail(field, `${label} no puede superar ${max.toLocaleString('en-US')}.`);
    if (Math.abs(number * 100 - Math.round(number * 100)) > 1e-6) {
      return fail(field, `${label} admite como máximo dos decimales.`);
    }
    return number;
  };

  const integerId = (field, value, label, max) => {
    const text = typeof value === 'string' ? value.trim() : value;
    const number = typeof text === 'number' ? text : Number(INTEGER_PATTERN.test(text) ? text : Number.NaN);
    if (!Number.isSafeInteger(number) || number < 1 || number > max) {
      return fail(field, `${label} debe ser un identificador válido.`);
    }
    return number;
  };

  const text = (field, value, label, max) => {
    if (isBlank(value)) return undefined;
    const raw = single(field, value, label);
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string') return fail(field, `${label} debe ser texto.`);

    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (trimmed.length > max) return fail(field, `${label} no puede superar ${max} caracteres.`);
    return trimmed;
  };

  const boolean = (field, value, label) => {
    if (isBlank(value)) return undefined;
    const raw = single(field, value, label);
    if (raw === undefined) return undefined;

    const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (normalized === true || normalized === 'true') return true;
    if (normalized === false || normalized === 'false') return false;
    return fail(field, `${label} debe ser verdadero o falso.`);
  };

  // Acepta ?serviceIds=1,2,3 y ?serviceIds=1&serviceIds=2. Quita duplicados y conserva el orden.
  const ids = (field, value, label, maxId, maxCount) => {
    if (isBlank(value)) return undefined;

    const parts = (Array.isArray(value) ? value : [value])
      .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
      .filter((item) => !isBlank(item));
    if (parts.length === 0) return undefined;

    const parsed = parts.map((item) => integerId(field, item, label, maxId));
    if (parsed.some((id) => id === undefined)) return undefined;

    const unique = [...new Set(parsed)];
    if (unique.length > maxCount) return fail(field, `No puedes filtrar por más de ${maxCount} servicios.`);
    return unique;
  };

  // El mínimo no puede ser mayor que el máximo.
  const range = (minField, min, max, message) => {
    if (min !== undefined && max !== undefined && min > max) fail(minField, message);
  };

  return {
    amount, text, boolean, ids, range, integerId, single,
  };
}

/** Convierte la query en filtros normalizados; solo incluye los que se enviaron. */
function readFilters(query, issues) {
  const read = createReaders(issues);
  const filters = {};
  const set = (key, value) => {
    if (value !== undefined) filters[key] = value;
  };

  set('q', read.text('q', query.q, 'La búsqueda', FILTER_LIMITS.search));

  if (!isBlank(query.propertyTypeId)) {
    const raw = read.single('propertyTypeId', query.propertyTypeId, 'El tipo de propiedad');
    if (raw !== undefined) {
      set('propertyTypeId', read.integerId('propertyTypeId', raw, 'El tipo de propiedad', FILTER_LIMITS.propertyTypeId));
    }
  }

  const minPrice = read.amount('minPrice', query.minPrice, 'El precio mínimo', FILTER_LIMITS.price);
  const maxPrice = read.amount('maxPrice', query.maxPrice, 'El precio máximo', FILTER_LIMITS.price);
  read.range('minPrice', minPrice, maxPrice, 'El precio mínimo no puede ser mayor que el máximo.');
  set('minPrice', minPrice);
  set('maxPrice', maxPrice);

  set('state', read.text('state', query.state, 'El estado', FILTER_LIMITS.text));
  set('municipality', read.text('municipality', query.municipality, 'El municipio', FILTER_LIMITS.text));

  const minLandArea = read.amount('minLandArea', query.minLandArea, 'La superficie de terreno mínima', FILTER_LIMITS.area);
  const maxLandArea = read.amount('maxLandArea', query.maxLandArea, 'La superficie de terreno máxima', FILTER_LIMITS.area);
  read.range('minLandArea', minLandArea, maxLandArea, 'La superficie de terreno mínima no puede ser mayor que la máxima.');
  set('minLandArea', minLandArea);
  set('maxLandArea', maxLandArea);

  set('hasConstruction', read.boolean('hasConstruction', query.hasConstruction, 'La existencia de construcción'));

  const minBuiltArea = read.amount('minBuiltArea', query.minBuiltArea, 'La superficie construida mínima', FILTER_LIMITS.area);
  const maxBuiltArea = read.amount('maxBuiltArea', query.maxBuiltArea, 'La superficie construida máxima', FILTER_LIMITS.area);
  read.range('minBuiltArea', minBuiltArea, maxBuiltArea, 'La superficie construida mínima no puede ser mayor que la máxima.');
  set('minBuiltArea', minBuiltArea);
  set('maxBuiltArea', maxBuiltArea);

  set('serviceIds', read.ids(
    'serviceIds',
    query.serviceIds,
    'Cada servicio',
    FILTER_LIMITS.serviceId,
    FILTER_LIMITS.serviceIds,
  ));

  return filters;
}

// Como en HU-008, los parámetros ajenos se ignoran; nunca alteran el filtro público.
const listPublicPropertiesQuerySchema = z
  .looseObject({
    page: paginationInteger(1, Number.MAX_SAFE_INTEGER, 'La página debe ser un entero mayor o igual a 1.'),
    limit: paginationInteger(12, 50, 'El límite debe ser un entero entre 1 y 50.'),
  })
  .superRefine(({ page, limit }, ctx) => {
    if (!Number.isSafeInteger((page - 1) * limit)) {
      ctx.addIssue({
        code: 'custom',
        path: ['page'],
        message: 'La página solicitada supera el rango permitido de paginación.',
      });
    }
  })
  .transform((data, ctx) => {
    const issues = [];
    const filters = readFilters(data, issues);

    for (const issue of issues) {
      ctx.issues.push({
        code: 'custom',
        path: [issue.field],
        message: issue.message,
        input: data[issue.field],
      });
    }

    return { page: data.page, limit: data.limit, filters };
  });

module.exports = { listPublicPropertiesQuerySchema, FILTER_LIMITS };
