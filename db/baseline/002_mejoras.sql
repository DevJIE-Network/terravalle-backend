-- Mejoras aplicadas al esquema inicial (índices en llaves foráneas, foto principal única y
-- validación del historial de estados). Se ejecutan dentro de la transacción de la migración.


-- 1) Solo una foto principal por propiedad
CREATE UNIQUE INDEX IF NOT EXISTS ux_property_photos_primary
ON property_photos (property_id)
WHERE is_primary;

-- 2) El historial solo acepta los mismos estados que properties.status
ALTER TABLE property_status_history
ADD CONSTRAINT chk_status_history_values
CHECK (
    new_status IN ('draft', 'active', 'inactive', 'withdrawn')
    AND (
        previous_status IS NULL
        OR previous_status IN ('draft', 'active', 'inactive', 'withdrawn')
    )
);

-- 3) Índices en llaves foráneas que no tenían
CREATE INDEX IF NOT EXISTS ix_status_history_property ON property_status_history (property_id);
CREATE INDEX IF NOT EXISTS ix_status_history_changed_by ON property_status_history (changed_by);
CREATE INDEX IF NOT EXISTS ix_favorites_property ON favorites (property_id);
CREATE INDEX IF NOT EXISTS ix_property_services_service ON property_services (service_id);
CREATE INDEX IF NOT EXISTS ix_contact_channels_property ON property_contact_channels (property_id);
CREATE INDEX IF NOT EXISTS ix_estimations_requested_by ON ai_estimations (requested_by);
CREATE INDEX IF NOT EXISTS ix_estimation_factors_estimation ON ai_estimation_factors (estimation_id);

