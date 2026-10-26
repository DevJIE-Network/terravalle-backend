/**
 * Migración 002 · Creación de tabla
 *
 * property_contact_requests: solicitudes de contacto que un comprador envía al vendedor
 * de una propiedad (usa los datos de contacto del perfil, HU-019).
 */
exports.up = (pgm) => {
  pgm.createTable('property_contact_requests', {
    id: 'bigserial',
    property_id: {
      type: 'bigint',
      notNull: true,
      references: 'properties',
      onDelete: 'CASCADE',
    },
    requester_id: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
      comment: 'Usuario que solicita el contacto; NULL si no tenía cuenta.',
    },
    name: { type: 'varchar(120)', notNull: true },
    email: { type: 'varchar(254)', notNull: true },
    phone: { type: 'varchar(20)' },
    message: { type: 'varchar(1000)', notNull: true },
    status: { type: 'varchar(20)', notNull: true, default: 'pending' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  }, {
    constraints: { primaryKey: 'id' },
    comment: 'Solicitudes de contacto de compradores hacia el vendedor de una propiedad.',
  });

  pgm.addConstraint('property_contact_requests', 'chk_contact_requests_status', {
    check: "status IN ('pending', 'contacted', 'closed')",
  });

  // Consulta típica: solicitudes de una propiedad filtradas por estado.
  pgm.createIndex('property_contact_requests', ['property_id', 'status'], {
    name: 'ix_contact_requests_property_status',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('property_contact_requests');
};
