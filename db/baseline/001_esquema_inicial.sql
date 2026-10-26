-- =========================================================
-- TERRAVALLE
-- Base de datos relacional - PostgreSQL
-- =========================================================

-- =========================================================
-- 1. USUARIOS
-- =========================================================

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(120) NOT NULL,

    email VARCHAR(254) NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    phone VARCHAR(20),

    contact_email VARCHAR(254),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    last_login_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_users_email
ON users (LOWER(email));


-- =========================================================
-- 2. SESIONES
-- =========================================================

CREATE TABLE sessions (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL,

    refresh_token_hash VARCHAR(255) NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX ix_sessions_user_id
ON sessions(user_id);

CREATE UNIQUE INDEX ux_sessions_refresh_token
ON sessions(refresh_token_hash);


-- =========================================================
-- 3. TIPOS DE PROPIEDAD
-- =========================================================

CREATE TABLE property_types (
    id SMALLSERIAL PRIMARY KEY,

    name VARCHAR(50) NOT NULL UNIQUE,

    description VARCHAR(255),

    is_active BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================================================
-- 4. PROPIEDADES
-- =========================================================

CREATE TABLE properties (
    id BIGSERIAL PRIMARY KEY,

    owner_id BIGINT NOT NULL,

    property_type_id SMALLINT NOT NULL,

    title VARCHAR(150) NOT NULL,

    description TEXT,

    publication_price NUMERIC(14,2),

    status VARCHAR(20) NOT NULL DEFAULT 'draft',

    published_at TIMESTAMPTZ,

    withdrawn_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_properties_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id),

    CONSTRAINT fk_properties_type
        FOREIGN KEY (property_type_id)
        REFERENCES property_types(id),

    CONSTRAINT chk_property_price
        CHECK (
            publication_price IS NULL
            OR publication_price >= 0
        ),

    CONSTRAINT chk_property_status
        CHECK (
            status IN (
                'draft',
                'active',
                'inactive',
                'withdrawn'
            )
        )
);

CREATE INDEX ix_properties_owner
ON properties(owner_id);

CREATE INDEX ix_properties_status
ON properties(status);

CREATE INDEX ix_properties_type
ON properties(property_type_id);

CREATE INDEX ix_properties_price
ON properties(publication_price);


-- =========================================================
-- 5. HISTORIAL DE ESTADOS DE PROPIEDAD
-- =========================================================

CREATE TABLE property_status_history (
    id BIGSERIAL PRIMARY KEY,

    property_id BIGINT NOT NULL,

    previous_status VARCHAR(20),

    new_status VARCHAR(20) NOT NULL,

    changed_by BIGINT NOT NULL,

    reason VARCHAR(255),

    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_status_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_status_user
        FOREIGN KEY (changed_by)
        REFERENCES users(id)
);


-- =========================================================
-- 6. FOTOGRAFÍAS DE PROPIEDADES
-- =========================================================

CREATE TABLE property_photos (
    id BIGSERIAL PRIMARY KEY,

    property_id BIGINT NOT NULL,

    image_url TEXT NOT NULL,

    storage_key VARCHAR(255),

    mime_type VARCHAR(100),

    file_size_bytes BIGINT,

    is_primary BOOLEAN NOT NULL DEFAULT FALSE,

    sort_order INT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_photos_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_photo_size
        CHECK (
            file_size_bytes IS NULL
            OR file_size_bytes >= 0
        )
);

CREATE INDEX ix_property_photos_property
ON property_photos(property_id);


-- =========================================================
-- 7. DIMENSIONES Y CONSTRUCCIÓN
-- =========================================================

CREATE TABLE property_features (
    id BIGSERIAL PRIMARY KEY,

    property_id BIGINT NOT NULL UNIQUE,

    land_area_m2 NUMERIC(12,2),

    frontage_m NUMERIC(10,2),

    depth_m NUMERIC(10,2),

    has_construction BOOLEAN NOT NULL DEFAULT FALSE,

    built_area_m2 NUMERIC(12,2),

    bedrooms SMALLINT,

    bathrooms NUMERIC(4,1),

    floors SMALLINT,

    parking_spaces SMALLINT,

    age_years SMALLINT,

    general_condition VARCHAR(50),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_features_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_land_area
        CHECK (
            land_area_m2 IS NULL
            OR land_area_m2 >= 0
        ),

    CONSTRAINT chk_frontage
        CHECK (
            frontage_m IS NULL
            OR frontage_m >= 0
        ),

    CONSTRAINT chk_depth
        CHECK (
            depth_m IS NULL
            OR depth_m >= 0
        ),

    CONSTRAINT chk_built_area
        CHECK (
            built_area_m2 IS NULL
            OR built_area_m2 >= 0
        ),

    CONSTRAINT chk_bedrooms
        CHECK (
            bedrooms IS NULL
            OR bedrooms >= 0
        ),

    CONSTRAINT chk_bathrooms
        CHECK (
            bathrooms IS NULL
            OR bathrooms >= 0
        ),

    CONSTRAINT chk_floors
        CHECK (
            floors IS NULL
            OR floors >= 0
        ),

    CONSTRAINT chk_parking
        CHECK (
            parking_spaces IS NULL
            OR parking_spaces >= 0
        ),

    CONSTRAINT chk_age
        CHECK (
            age_years IS NULL
            OR age_years >= 0
        )
);


-- =========================================================
-- 8. CATÁLOGO DE SERVICIOS
-- =========================================================

CREATE TABLE services (
    id SMALLSERIAL PRIMARY KEY,

    name VARCHAR(80) NOT NULL UNIQUE,

    description VARCHAR(255),

    is_active BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================================================
-- 9. SERVICIOS POR PROPIEDAD
-- =========================================================

CREATE TABLE property_services (
    property_id BIGINT NOT NULL,

    service_id SMALLINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (
        property_id,
        service_id
    ),

    CONSTRAINT fk_property_services_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_property_services_service
        FOREIGN KEY (service_id)
        REFERENCES services(id)
);


-- =========================================================
-- 10. UBICACIÓN DE LA PROPIEDAD
-- =========================================================

CREATE TABLE property_locations (
    id BIGSERIAL PRIMARY KEY,

    property_id BIGINT NOT NULL UNIQUE,

    street VARCHAR(150),

    exterior_number VARCHAR(20),

    interior_number VARCHAR(20),

    neighborhood VARCHAR(120),

    municipality VARCHAR(120),

    state VARCHAR(120),

    postal_code VARCHAR(10),

    country VARCHAR(80) NOT NULL DEFAULT 'México',

    latitude NUMERIC(10,7),

    longitude NUMERIC(10,7),

    formatted_address TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_location_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_latitude
        CHECK (
            latitude IS NULL
            OR latitude BETWEEN -90 AND 90
        ),

    CONSTRAINT chk_longitude
        CHECK (
            longitude IS NULL
            OR longitude BETWEEN -180 AND 180
        )
);

CREATE INDEX ix_locations_state
ON property_locations(state);

CREATE INDEX ix_locations_municipality
ON property_locations(municipality);


-- =========================================================
-- 11. CATEGORÍAS DE PUNTOS CERCANOS
-- =========================================================

CREATE TABLE nearby_place_categories (
    id SMALLSERIAL PRIMARY KEY,

    name VARCHAR(80) NOT NULL UNIQUE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================================================
-- 12. PUNTOS DE INTERÉS CERCANOS
-- =========================================================

CREATE TABLE nearby_places (
    id BIGSERIAL PRIMARY KEY,

    property_id BIGINT NOT NULL,

    category_id SMALLINT NOT NULL,

    name VARCHAR(150) NOT NULL,

    approximate_distance_m INT,

    latitude NUMERIC(10,7),

    longitude NUMERIC(10,7),

    provider VARCHAR(80),

    provider_place_id VARCHAR(255),

    last_checked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_nearby_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_nearby_category
        FOREIGN KEY (category_id)
        REFERENCES nearby_place_categories(id),

    CONSTRAINT chk_nearby_distance
        CHECK (
            approximate_distance_m IS NULL
            OR approximate_distance_m >= 0
        )
);

CREATE INDEX ix_nearby_property
ON nearby_places(property_id);

CREATE INDEX ix_nearby_category
ON nearby_places(category_id);


-- =========================================================
-- 13. FAVORITOS
-- =========================================================

CREATE TABLE favorites (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL,

    property_id BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_favorite_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_favorite_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT ux_favorite_user_property
        UNIQUE (
            user_id,
            property_id
        )
);

CREATE INDEX ix_favorites_user
ON favorites(user_id);


-- =========================================================
-- 14. MEDIOS DE CONTACTO AUTORIZADOS
-- =========================================================

CREATE TABLE property_contact_channels (
    id BIGSERIAL PRIMARY KEY,

    property_id BIGINT NOT NULL,

    channel_type VARCHAR(20) NOT NULL,

    contact_value VARCHAR(254) NOT NULL,

    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_contact_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_contact_channel
        CHECK (
            channel_type IN (
                'email',
                'phone',
                'whatsapp'
            )
        )
);


-- =========================================================
-- 15. ESTIMACIONES DE IA
-- =========================================================

CREATE TABLE ai_estimations (
    id BIGSERIAL PRIMARY KEY,

    property_id BIGINT NOT NULL,

    requested_by BIGINT NOT NULL,

    estimated_value NUMERIC(14,2),

    estimated_min NUMERIC(14,2),

    estimated_max NUMERIC(14,2),

    explanation TEXT,

    model_name VARCHAR(100),

    model_version VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_estimation_property
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_estimation_user
        FOREIGN KEY (requested_by)
        REFERENCES users(id),

    CONSTRAINT chk_estimated_values
        CHECK (
            (
                estimated_value IS NOT NULL
                AND estimated_value >= 0
            )
            OR
            (
                estimated_min IS NOT NULL
                AND estimated_max IS NOT NULL
                AND estimated_min >= 0
                AND estimated_max >= estimated_min
            )
        )
);

CREATE INDEX ix_estimations_property
ON ai_estimations(property_id);


-- =========================================================
-- 16. FACTORES CONSIDERADOS POR LA IA
-- =========================================================

CREATE TABLE ai_estimation_factors (
    id BIGSERIAL PRIMARY KEY,

    estimation_id BIGINT NOT NULL,

    factor_name VARCHAR(100) NOT NULL,

    factor_value VARCHAR(255),

    impact VARCHAR(20),

    explanation VARCHAR(500),

    CONSTRAINT fk_factor_estimation
        FOREIGN KEY (estimation_id)
        REFERENCES ai_estimations(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_factor_impact
        CHECK (
            impact IS NULL
            OR impact IN (
                'positive',
                'neutral',
                'negative'
            )
        )
);


-- =========================================================
-- 17. ACTUALIZACIÓN AUTOMÁTICA DE updated_at
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER trg_properties_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER trg_property_features_updated_at
BEFORE UPDATE ON property_features
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER trg_property_locations_updated_at
BEFORE UPDATE ON property_locations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER trg_property_contacts_updated_at
BEFORE UPDATE ON property_contact_channels
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- 18. DATOS INICIALES
-- =========================================================

INSERT INTO property_types (name)
VALUES
    ('Terreno'),
    ('Casa'),
    ('Departamento'),
    ('Otro');


INSERT INTO services (name)
VALUES
    ('Agua potable'),
    ('Electricidad'),
    ('Drenaje'),
    ('Gas'),
    ('Internet'),
    ('Alumbrado público'),
    ('Pavimentación'),
    ('Banqueta');


INSERT INTO nearby_place_categories (name)
VALUES
    ('Escuela'),
    ('Hospital'),
    ('Farmacia'),
    ('Supermercado'),
    ('Parque'),
    ('Gasolinera'),
    ('Banco'),
    ('Transporte');


-- =========================================================
-- FIN
-- =========================================================