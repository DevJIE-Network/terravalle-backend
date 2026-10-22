/**
 * Migración 001 · Esquema inicial (baseline)
 *
 * Reproduce la base de datos de TerraValle tal como se creó al inicio del proyecto:
 * 16 tablas, índices, restricciones, trigger de updated_at y catálogos iniciales
 * (tipos de propiedad, servicios y categorías de lugares cercanos).
 *
 * El SQL vive en db/baseline/ para conservar el script original sin cambios.
 *
 * En una base que YA tiene este esquema (por ejemplo, producción en Azure), esta migración
 * no se ejecuta: se marca como aplicada con `npm run migrate:baseline`.
 */
const fs = require('node:fs');
const path = require('node:path');

const BASELINE_DIR = path.join(__dirname, '..', 'db', 'baseline');

const readSql = (file) => fs.readFileSync(path.join(BASELINE_DIR, file), 'utf8');

// Tablas en orden inverso de dependencias (primero las que tienen llaves foráneas).
const TABLES = [
  'ai_estimation_factors',
  'ai_estimations',
  'property_contact_channels',
  'favorites',
  'nearby_places',
  'nearby_place_categories',
  'property_locations',
  'property_services',
  'services',
  'property_features',
  'property_photos',
  'property_status_history',
  'properties',
  'property_types',
  'sessions',
  'users',
];

exports.up = (pgm) => {
  pgm.sql(readSql('001_esquema_inicial.sql'));
  pgm.sql(readSql('002_mejoras.sql'));
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS ${TABLES.join(', ')} CASCADE`);
  pgm.sql('DROP FUNCTION IF EXISTS set_updated_at() CASCADE');
};
