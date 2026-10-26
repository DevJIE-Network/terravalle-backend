/**
 * Migración 004 · Creación de restricción
 *
 * chk_users_phone_format: la base de datos también garantiza el formato del teléfono de
 * contacto del perfil (HU-019). Es la misma regla que valida la API:
 * dígitos con +, espacios o guiones opcionales y entre 10 y 15 dígitos.
 */
exports.up = (pgm) => {
  pgm.addConstraint('users', 'chk_users_phone_format', {
    check: `phone IS NULL OR (
      phone ~ '^\\+?[0-9][0-9 -]*[0-9]$'
      AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 10 AND 15
    )`,
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('users', 'chk_users_phone_format');
};
