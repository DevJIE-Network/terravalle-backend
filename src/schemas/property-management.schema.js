const { z } = require('zod');

/**
 * HU-008: administración de las propiedades del vendedor.
 * Valida la edición parcial, el cambio de estado y los filtros del listado.
 *
 * Igual que en HU-005, las reglas viven en funciones simples (mensajes en español) y
 * Zod solo exige la forma del objeto y rechaza campos desconocidos.
 */

const PROPERTY_STATUSES = ['draft', 'active', 'inactive', 'withdrawn'];

// Cambios de estado que puede hacer el vendedor desde PATCH /:id/status.
// El retiro (withdrawn) es definitivo y se hace con DELETE /:id.
const STATUS_TRANSITIONS = {
  draft: ['active'],
  active: ['inactive'],
  inactive: ['active'],
  withdrawn: [],
};

const SETTABLE_STATUSES = ['active', 'inactive'];

const LIMITS = {
  titleMin: 3,
  titleMax: 150,
  descriptionMax: 3000,
  reasonMax: 255,
  priceMax: 999_999_999_999,
  pageSizeMax: 100,
  pageSizeDefault: 20,
};

const isAbsent = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() === '' ? Number.NaN : Number(value.trim());
  return Number.NaN;
}

const hasMoreThanTwoDecimals = (n) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;

const unknownField = z.unknown().optional();

// ------------------------------------------------------------ Edición

const EDITABLE_FIELDS = ['title', 'propertyTypeId', 'description', 'publicationPrice'];

function validateUpdate(data, ctx) {
  const add = (field, message) => ctx.addIssue({ code: 'custom', path: [field], message });

  if (!EDITABLE_FIELDS.some((field) => data[field] !== undefined)) {
    ctx.addIssue({ code: 'custom', path: [], message: 'Envía al menos un campo para actualizar.' });
    return;
  }

  if (data.title !== undefined) {
    const title = typeof data.title === 'string' ? data.title.trim() : null;
    if (title === null) {
      add('title', 'El título debe ser texto.');
    } else if (title.length < LIMITS.titleMin) {
      add('title', `El título debe tener al menos ${LIMITS.titleMin} caracteres.`);
    } else if (title.length > LIMITS.titleMax) {
      add('title', `El título no puede superar los ${LIMITS.titleMax} caracteres.`);
    }
  }

  if (data.propertyTypeId !== undefined) {
    const n = toNumber(data.propertyTypeId);
    if (!Number.isInteger(n) || n <= 0) add('propertyTypeId', 'El tipo de propiedad debe ser válido.');
  }

  // Descripción: null o texto vacío la dejan en blanco.
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      add('description', 'La descripción debe ser texto.');
    } else if (data.description.trim().length > LIMITS.descriptionMax) {
      add('description', `La descripción no puede superar los ${LIMITS.descriptionMax} caracteres.`);
    }
  }

  // Precio: null o texto vacío lo quitan (la propiedad queda sin precio publicado).
  if (data.publicationPrice !== undefined && !isAbsent(data.publicationPrice)) {
    const n = toNumber(data.publicationPrice);
    if (!Number.isFinite(n)) {
      add('publicationPrice', 'El precio debe ser un número.');
    } else if (n < 0) {
      add('publicationPrice', 'El precio no puede ser negativo.');
    } else if (n > LIMITS.priceMax) {
      add('publicationPrice', `El precio no puede superar ${LIMITS.priceMax.toLocaleString('en-US')}.`);
    } else if (hasMoreThanTwoDecimals(n)) {
      add('publicationPrice', 'El precio admite como máximo dos decimales.');
    }
  }
}

// Solo se aceptan campos editables: ownerId, status, etc. se rechazan por ser desconocidos.
const updatePropertySchema = z
  .object({
    title: unknownField,
    propertyTypeId: unknownField,
    description: unknownField,
    publicationPrice: unknownField,
  })
  .strict()
  .superRefine(validateUpdate);

/**
 * Convierte un cuerpo YA validado en los campos a actualizar (solo los enviados).
 * @returns {{ title?: string, propertyTypeId?: number, description?: string|null, publicationPrice?: number|null }}
 */
function toPropertyUpdate(data) {
  const fields = {};

  if (data.title !== undefined) fields.title = data.title.trim();
  if (data.propertyTypeId !== undefined) fields.propertyTypeId = toNumber(data.propertyTypeId);
  if (data.description !== undefined) {
    const description = data.description === null ? '' : data.description.trim();
    fields.description = description === '' ? null : description;
  }
  if (data.publicationPrice !== undefined) {
    fields.publicationPrice = isAbsent(data.publicationPrice) ? null : toNumber(data.publicationPrice);
  }

  return fields;
}

// ------------------------------------------------------ Cambio de estado

function validateStatusChange(data, ctx) {
  const add = (field, message) => ctx.addIssue({ code: 'custom', path: [field], message });

  if (isAbsent(data.status)) {
    add('status', 'Indica el nuevo estado: active o inactive.');
  } else if (data.status === 'withdrawn') {
    add('status', 'Para retirar una propiedad usa DELETE /api/properties/:id.');
  } else if (data.status === 'draft') {
    add('status', 'Una propiedad no puede regresar a borrador.');
  } else if (!SETTABLE_STATUSES.includes(data.status)) {
    add('status', `El estado debe ser: ${SETTABLE_STATUSES.join(' o ')}.`);
  }

  if (!isAbsent(data.reason)) {
    if (typeof data.reason !== 'string') {
      add('reason', 'El motivo debe ser texto.');
    } else if (data.reason.trim().length > LIMITS.reasonMax) {
      add('reason', `El motivo no puede superar los ${LIMITS.reasonMax} caracteres.`);
    }
  }
}

const changeStatusSchema = z
  .object({
    status: unknownField,
    reason: unknownField,
  })
  .strict()
  .superRefine(validateStatusChange);

/** @returns {{ status: string, reason: string|null }} */
function toStatusChange(data) {
  return {
    status: data.status,
    reason: isAbsent(data.reason) ? null : data.reason.trim(),
  };
}

// ----------------------------------------------------------- Listado

function validateListQuery(data, ctx) {
  const add = (field, message) => ctx.addIssue({ code: 'custom', path: [field], message });

  if (!isAbsent(data.status) && !PROPERTY_STATUSES.includes(data.status)) {
    add('status', `El estado debe ser: ${PROPERTY_STATUSES.join(', ')}.`);
  }

  if (!isAbsent(data.page)) {
    const page = toNumber(data.page);
    if (!Number.isInteger(page) || page < 1) add('page', 'La página debe ser un entero mayor o igual a 1.');
  }

  if (!isAbsent(data.limit)) {
    const limit = toNumber(data.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.pageSizeMax) {
      add('limit', `El límite debe ser un entero entre 1 y ${LIMITS.pageSizeMax}.`);
    }
  }
}

// Sin .strict(): se ignoran parámetros ajenos (por ejemplo, marcas anti-caché del navegador).
const listPropertiesQuerySchema = z
  .object({
    status: unknownField,
    page: unknownField,
    limit: unknownField,
  })
  .superRefine(validateListQuery);

/** @returns {{ status: string|null, page: number, limit: number }} */
function toListOptions(data) {
  return {
    status: isAbsent(data.status) ? null : data.status,
    page: isAbsent(data.page) ? 1 : toNumber(data.page),
    limit: isAbsent(data.limit) ? LIMITS.pageSizeDefault : toNumber(data.limit),
  };
}

module.exports = {
  PROPERTY_STATUSES,
  STATUS_TRANSITIONS,
  LIMITS,
  updatePropertySchema,
  toPropertyUpdate,
  changeStatusSchema,
  toStatusChange,
  listPropertiesQuerySchema,
  toListOptions,
};
