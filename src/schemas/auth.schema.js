const { z } = require('zod');

const registerSchema = z.strictObject({
  name: z.string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .max(100, 'El nombre no puede superar los 100 caracteres.'),
  email: z.string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'El correo electrónico no es válido.' })),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .refine(
      (password) => Buffer.byteLength(password, 'utf8') <= 72,
      'La contraseña no puede superar los 72 bytes en UTF-8.'
    ),
});

module.exports = { registerSchema };
