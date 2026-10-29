/**
 * Migración 005 · Creación de tabla (HU-009)
 *
 * reference_prices: precios de referencia por m² (terreno y construcción) que usa la
 * estimación orientativa. Se buscan del nivel más específico al más general:
 * código postal → municipio → estado → referencia nacional (en el código).
 *
 * Los valores iniciales son PARÁMETROS POR CALIBRAR (no datos oficiales). Deben
 * reemplazarse con fuentes como el Índice SHF de Precios de la Vivienda o las tablas
 * de valores unitarios de suelo y construcción de cada municipio, indicando la fuente.
 */
const NATIONAL = { land: 2500, construction: 9000 };

// Factor regional inicial por estado (1 = referencia nacional).
const INITIAL_STATES = {
  'Ciudad de México': 2.6,
  'Nuevo León': 1.6,
  Jalisco: 1.4,
  Querétaro: 1.35,
  'Estado de México': 1.15,
  México: 1.15,
  Puebla: 1,
  Hidalgo: 0.85,
};

const INITIAL_SOURCE = 'Parámetro inicial TerraValle (por calibrar con fuentes oficiales)';

exports.up = (pgm) => {
  pgm.createTable(
    'reference_prices',
    {
      id: 'id',
      state: { type: 'varchar(120)', notNull: true },
      municipality: { type: 'varchar(120)' },
      postal_code: { type: 'varchar(10)' },
      land_price_m2: { type: 'numeric(12,2)', notNull: true },
      construction_price_m2: { type: 'numeric(12,2)', notNull: true },
      source: { type: 'varchar(255)', notNull: true },
      valid_from: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
      is_active: { type: 'boolean', notNull: true, default: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') },
    },
    { comment: 'Precios de referencia por m² para la estimación orientativa (HU-009).' },
  );

  pgm.addConstraint('reference_prices', 'chk_reference_prices_positive', {
    check: 'land_price_m2 > 0 AND construction_price_m2 > 0',
  });
  pgm.addConstraint('reference_prices', 'chk_reference_prices_municipality', {
    check: 'postal_code IS NULL OR municipality IS NOT NULL',
  });

  pgm.createIndex('reference_prices', ['state', 'municipality', 'postal_code'], {
    name: 'ix_reference_prices_zone',
  });

  const rows = Object.entries(INITIAL_STATES)
    .map(
      ([state, factor]) =>
        `('${state}', ${NATIONAL.land * factor}, ${NATIONAL.construction * factor}, '${INITIAL_SOURCE}')`,
    )
    .join(',\n      ');

  pgm.sql(`
    INSERT INTO reference_prices (state, land_price_m2, construction_price_m2, source)
    VALUES
      ${rows}
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('reference_prices');
};
