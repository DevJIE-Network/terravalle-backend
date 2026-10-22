const { z } = require('zod');

// Un campo opcional enviado vacío ('') se guarda como null para poder borrarlo.
const emptyToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);

// Teléfono: dígitos con +, espacios o guiones opcionales; entre 10 y 15 dígitos.
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]*[0-9]$/;

const phoneSchema = z.preprocess(
  emptyToNull,
  z.string()
    .trim()
    .max(20, 'El teléfono no puede superar los 20 caracteres.')
    .regex(PHONE_PATTERN, 'El teléfono solo puede contener números, espacios, guiones y +.')
    .refine((value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 10 && digits <= 15;
    }, 'El teléfono debe tener entre 10 y 15 dígitos.')
    .nullable(),
);

const contactEmailSchema = z.preprocess(
  emptyToNull,
  z.string()
    .trim()
    .toLowerCase()
    .max(254, 'El correo de contacto no puede superar los 254 caracteres.')
    .pipe(z.email({ error: 'El correo de contacto no es válido.' }))
    .nullable(),
);

const updateProfileSchema = z
  .strictObject({
    name: z.string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres.')
      .max(100, 'El nombre no puede superar los 100 caracteres.')
      .optional(),
    email: z.string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: 'El correo electrónico no es válido.' }))
      .optional(),
    phone: phoneSchema.optional(),
    contactEmail: contactEmailSchema.optional(),
  })
  .refine(
    (data) => ['name', 'email', 'phone', 'contactEmail'].some((key) => data[key] !== undefined),
    'Envía al menos un campo para actualizar (name, email, phone o contactEmail).',
  );

module.exports = { updateProfileSchema };
