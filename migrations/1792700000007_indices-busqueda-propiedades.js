/**
 * Migración 007 · Índices para la búsqueda y filtrado de propiedades (HU-011)
 *
 * Apoyan GET /api/properties con filtros: el catálogo solo consulta propiedades activas y
 * no eliminadas, por eso los índices de `properties` son PARCIALES (más pequeños y selectivos).
 *
 * - ix_properties_catalog_order: orden del catálogo (published_at DESC, id DESC) + paginación.
 * - ix_properties_catalog_type_price: filtro por tipo de inmueble y rango de precio.
 * - ix_features_land_area / ix_features_built_area: rangos de superficie.
 *
 * Ya existían ix_locations_state, ix_locations_municipality (ubicación) y la llave primaria
 * (property_id, service_id) de property_services (servicios), que cubren esos filtros.
 * La búsqueda de texto usa ILIKE '%texto%', que un índice B-tree no acelera; si el catálogo
 * crece mucho puede evaluarse pg_trgm (requiere habilitar la extensión en Azure).
 */
exports.up = (pgm) => {
  // SQL explícito: debe coincidir con ORDER BY published_at DESC NULLS LAST, id DESC.
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS ix_properties_catalog_order
    ON properties (published_at DESC NULLS LAST, id DESC)
    WHERE status = 'active' AND deleted_at IS NULL
  `);

  pgm.createIndex('properties', ['property_type_id', 'publication_price'], {
    name: 'ix_properties_catalog_type_price',
    where: "status = 'active' AND deleted_at IS NULL",
    ifNotExists: true,
  });

  pgm.createIndex('property_features', 'land_area_m2', {
    name: 'ix_features_land_area',
    ifNotExists: true,
  });

  pgm.createIndex('property_features', 'built_area_m2', {
    name: 'ix_features_built_area',
    where: 'built_area_m2 IS NOT NULL',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('property_features', 'built_area_m2', { name: 'ix_features_built_area', ifExists: true });
  pgm.dropIndex('property_features', 'land_area_m2', { name: 'ix_features_land_area', ifExists: true });
  pgm.dropIndex('properties', ['property_type_id', 'publication_price'], {
    name: 'ix_properties_catalog_type_price',
    ifExists: true,
  });
  pgm.sql('DROP INDEX IF EXISTS ix_properties_catalog_order');
};
