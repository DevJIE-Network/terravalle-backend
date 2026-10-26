/**
 * Migración 003 · Adición de columna
 *
 * services.icon: nombre del ícono que el frontend muestra junto a cada servicio
 * en el formulario de la HU-006. Se llena para el catálogo inicial.
 */
const ICONS = {
  'Agua potable': 'droplet',
  Electricidad: 'zap',
  Drenaje: 'waves',
  Gas: 'flame',
  Internet: 'wifi',
  'Alumbrado público': 'lamp',
  Pavimentación: 'road',
  Banqueta: 'footprints',
};

exports.up = (pgm) => {
  pgm.addColumn('services', {
    icon: {
      type: 'varchar(40)',
      comment: 'Nombre del ícono que muestra el frontend para el servicio.',
    },
  });

  // Valores fijos del catálogo inicial (no provienen del usuario).
  const cases = Object.entries(ICONS)
    .map(([name, icon]) => `WHEN '${name}' THEN '${icon}'`)
    .join('\n      ');

  pgm.sql(`
    UPDATE services
    SET icon = CASE name
      ${cases}
    END
    WHERE name IN (${Object.keys(ICONS).map((name) => `'${name}'`).join(', ')})
  `);
};

exports.down = (pgm) => {
  pgm.dropColumn('services', 'icon');
};
