/**
 * Migración 006 · Adición de columna con restricción (HU-005 / HU-009)
 *
 * property_features.construction_quality: calidad de la construcción. Es el dato que más
 * cambia el costo por m² de construcción en la estimación orientativa. Es opcional para
 * no invalidar las propiedades ya registradas.
 */
exports.up = (pgm) => {
  pgm.addColumn('property_features', {
    construction_quality: {
      type: 'varchar(20)',
      comment: 'Calidad de la construcción: economica, media, residencial o lujo.',
    },
  });

  pgm.addConstraint('property_features', 'chk_features_construction_quality', {
    check:
      "construction_quality IS NULL OR construction_quality IN ('economica', 'media', 'residencial', 'lujo')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('property_features', 'chk_features_construction_quality');
  pgm.dropColumn('property_features', 'construction_quality');
};
