/**
 * Carga datos de prueba en la base de DESARROLLO.
 * Uso: npm run seed:dev
 *
 * - Usa MIGRATION_DATABASE_URL (la misma conexión de las migraciones, que apunta a dev).
 * - Se niega a correr si el nombre de la base no termina en "_dev": nunca toca producción.
 * - Es repetible: borra lo que cargó la vez anterior (usuarios @terravalle.dev y sus
 *   propiedades, en cascada) y lo vuelve a crear. No toca datos capturados a mano.
 *
 * Cuentas creadas (contraseña para todas: TerraValle2026!):
 *   vendedora@terravalle.dev   Mariana Ruiz      · 6 propiedades
 *   vendedor@terravalle.dev    Carlos Medina     · 5 propiedades
 *   inmobiliaria@terravalle.dev Bahía Inmuebles  · 3 propiedades
 *   comprador@terravalle.dev   Laura Gómez       · sin propiedades, con favoritos
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const SEED_DOMAIN = '@terravalle.dev';
const SEED_PASSWORD = 'TerraValle2026!';

/* ------------------------------------------------------------------ datos */

const USERS = [
  { key: 'mariana', name: 'Mariana Ruiz', email: `vendedora${SEED_DOMAIN}`, phone: '3221234567' },
  { key: 'carlos', name: 'Carlos Medina', email: `vendedor${SEED_DOMAIN}`, phone: '3229876543' },
  { key: 'bahia', name: 'Bahía Inmuebles', email: `inmobiliaria${SEED_DOMAIN}`, phone: '3222223344' },
  { key: 'laura', name: 'Laura Gómez', email: `comprador${SEED_DOMAIN}`, phone: null },
];

/** Fotos de prueba: imágenes públicas de picsum.photos con semilla fija (siempre la misma). */
const photos = (seed, count = 4) =>
  Array.from({ length: count }, (_, index) => `https://picsum.photos/seed/terravalle-${seed}-${index + 1}/1200/800`);

const ALL_SERVICES = [
  'Agua potable',
  'Electricidad',
  'Drenaje',
  'Gas',
  'Internet',
  'Alumbrado público',
  'Pavimentación',
  'Banqueta',
];
const URBAN = ALL_SERVICES;
const SUBURBAN = ['Agua potable', 'Electricidad', 'Drenaje', 'Internet', 'Alumbrado público'];
const RURAL = ['Agua potable', 'Electricidad'];

const PROPERTIES = [
  {
    owner: 'mariana',
    type: 'Casa',
    title: 'Casa con alberca en Marina Vallarta',
    description:
      'Casa de dos plantas a unos pasos del malecón de la marina. Sala con doble altura, cocina integral, terraza con alberca y jardín. Fraccionamiento con vigilancia las 24 horas.',
    price: 8950000,
    status: 'active',
    features: { land: 320, frontage: 12, depth: 26.5, construction: { built: 280, floors: 2, bedrooms: 4, bathrooms: 3.5, parking: 2, age: 8, condition: 'excelente', quality: 'residencial' } },
    location: { street: 'Paseo de la Marina', ext: '245', neighborhood: 'Marina Vallarta', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48335', lat: 20.6658, lng: -105.2525 },
    services: URBAN,
    nearby: [['Supermercado', 'La Comer Marina', 650], ['Hospital', 'Hospital CMQ Premiere', 2100], ['Escuela', 'Colegio Americano de Puerto Vallarta', 1800], ['Parque', 'Malecón de Marina Vallarta', 300], ['Banco', 'BBVA Marina', 900]],
    contact: { type: 'whatsapp', value: '3221234567' },
    photoSeed: 'marina',
    estimation: { min: 8200000, value: 8800000, max: 9500000 },
  },
  {
    owner: 'mariana',
    type: 'Departamento',
    title: 'Departamento con vista al mar en Zona Romántica',
    description:
      'Departamento remodelado en el tercer piso, con balcón y vista a la bahía. A dos calles de Playa Los Muertos, restaurantes y galerías. Ideal para vivir o para renta vacacional.',
    price: 5480000,
    status: 'active',
    features: { land: 95, frontage: null, depth: null, construction: { built: 95, floors: 1, bedrooms: 2, bathrooms: 2, parking: 1, age: 12, condition: 'bueno', quality: 'media' } },
    location: { street: 'Calle Olas Altas', ext: '510', interior: '3B', neighborhood: 'Zona Romántica', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48380', lat: 20.6015, lng: -105.2365 },
    services: URBAN,
    nearby: [['Parque', 'Playa Los Muertos', 200], ['Farmacia', 'Farmacia Guadalajara Olas Altas', 350], ['Transporte', 'Parada de autobús Basilio Badillo', 150], ['Supermercado', 'OXXO Olas Altas', 120]],
    contact: { type: 'phone', value: '3221234567' },
    photoSeed: 'romantica',
    estimation: { min: 5100000, value: 5450000, max: 5900000 },
  },
  {
    owner: 'mariana',
    type: 'Terreno',
    title: 'Terreno plano en El Pitillal',
    description:
      'Terreno regular y plano, listo para construir. Calle pavimentada, todos los servicios a pie de lote y escrituras en orden. Zona habitacional consolidada cerca de escuelas y comercio.',
    price: 1650000,
    status: 'active',
    features: { land: 250, frontage: 10, depth: 25 },
    location: { street: 'Calle Juárez', ext: '1120', neighborhood: 'El Pitillal', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48290', lat: 20.6489, lng: -105.2187 },
    services: URBAN,
    nearby: [['Escuela', 'Primaria Benito Juárez', 400], ['Supermercado', 'Walmart Pitillal', 1300], ['Transporte', 'Ruta Pitillal–Centro', 100], ['Gasolinera', 'Gasolinera Pemex Pitillal', 800]],
    contact: { type: 'whatsapp', value: '3221234567' },
    photoSeed: 'pitillal',
    estimation: null,
  },
  {
    owner: 'mariana',
    type: 'Casa',
    title: 'Casa familiar en Fluvial Vallarta',
    description:
      'Casa de una planta con tres recámaras, patio trasero y cochera techada. Fraccionamiento cerrado con áreas verdes y casa club.',
    price: 4250000,
    status: 'active',
    features: { land: 180, frontage: 9, depth: 20, construction: { built: 150, floors: 1, bedrooms: 3, bathrooms: 2, parking: 2, age: 15, condition: 'bueno', quality: 'media' } },
    location: { street: 'Av. Fluvial Vallarta', ext: '310', neighborhood: 'Fluvial Vallarta', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48312', lat: 20.6467, lng: -105.2312 },
    services: URBAN,
    nearby: [['Hospital', 'Hospital San Javier Marina', 1500], ['Supermercado', 'Soriana Fluvial', 700], ['Parque', 'Parque Lineal Río Pitillal', 450], ['Escuela', 'Colegio Vallarta', 900]],
    contact: { type: 'email', value: 'vendedora@terravalle.dev' },
    photoSeed: 'fluvial',
    estimation: { min: 3900000, value: 4180000, max: 4500000 },
  },
  {
    owner: 'mariana',
    type: 'Terreno',
    title: 'Lote en preventa en Las Moras',
    description: 'Lote residencial en preventa. Publicación pausada mientras se actualiza la documentación.',
    price: 980000,
    status: 'inactive',
    features: { land: 200, frontage: 10, depth: 20 },
    location: { street: 'Calle Las Moras', ext: '45', neighborhood: 'Las Moras', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48290', lat: 20.6612, lng: -105.2051 },
    services: SUBURBAN,
    nearby: [],
    contact: { type: 'phone', value: '3221234567' },
    photoSeed: 'moras',
    estimation: null,
  },
  {
    owner: 'mariana',
    type: 'Departamento',
    title: 'Borrador · Estudio en el Centro',
    description: 'Publicación en preparación (borrador): no debe aparecer en el catálogo.',
    price: null,
    status: 'draft',
    features: null,
    location: null,
    services: [],
    nearby: [],
    contact: null,
    photoSeed: null,
    estimation: null,
  },
  {
    owner: 'carlos',
    type: 'Terreno',
    title: 'Terreno con vista a la bahía en Mismaloya',
    description:
      'Terreno en ladera con vista panorámica a la bahía de Banderas y a Los Arcos. Acceso por carretera a Barra de Navidad. Ideal para casa de descanso o desarrollo boutique.',
    price: 6200000,
    status: 'active',
    features: { land: 1200, frontage: 30, depth: 40 },
    location: { street: 'Carretera a Barra de Navidad', ext: 'km 10.5', neighborhood: 'Mismaloya', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48399', lat: 20.5325, lng: -105.2918 },
    services: RURAL,
    nearby: [['Parque', 'Playa Mismaloya', 600], ['Transporte', 'Parada Mismaloya', 350], ['Supermercado', 'Abarrotes Mismaloya', 700]],
    contact: { type: 'whatsapp', value: '3229876543' },
    photoSeed: 'mismaloya',
    estimation: { min: 5400000, value: 6000000, max: 6700000 },
  },
  {
    owner: 'carlos',
    type: 'Casa',
    title: 'Casa de playa en Bucerías',
    description:
      'Casa a 150 metros de la playa, con jardín tropical, palapa y regadera exterior. Dos niveles, cuatro recámaras y cuarto de servicio.',
    price: 7350000,
    status: 'active',
    features: { land: 400, frontage: 16, depth: 25, construction: { built: 260, floors: 2, bedrooms: 4, bathrooms: 3, parking: 2, age: 10, condition: 'bueno', quality: 'residencial' } },
    location: { street: 'Calle Lázaro Cárdenas', ext: '88', neighborhood: 'Centro', municipality: 'Bahía de Banderas', state: 'Nayarit', postalCode: '63732', lat: 20.7555, lng: -105.3342 },
    services: URBAN,
    nearby: [['Parque', 'Playa Bucerías', 150], ['Farmacia', 'Farmacia Similares Bucerías', 300], ['Banco', 'Banorte Bucerías', 500], ['Supermercado', 'Mega Soriana Bucerías', 1600]],
    contact: { type: 'phone', value: '3229876543' },
    photoSeed: 'bucerias',
    estimation: { min: 6800000, value: 7200000, max: 7700000 },
  },
  {
    owner: 'carlos',
    type: 'Departamento',
    title: 'Departamento en Nuevo Vallarta con amenidades',
    description:
      'Departamento en desarrollo frente al campo de golf: alberca, gimnasio, seguridad y acceso a club de playa. Se entrega amueblado.',
    price: 4950000,
    status: 'active',
    features: { land: 110, frontage: null, depth: null, construction: { built: 110, floors: 1, bedrooms: 2, bathrooms: 2, parking: 1, age: 3, condition: 'excelente', quality: 'residencial' } },
    location: { street: 'Paseo de los Cocoteros', ext: '55', interior: '804', neighborhood: 'Nuevo Vallarta', municipality: 'Bahía de Banderas', state: 'Nayarit', postalCode: '63735', lat: 20.6982, lng: -105.2981 },
    services: URBAN,
    nearby: [['Parque', 'Club de Golf Nuevo Vallarta', 250], ['Supermercado', 'Walmart Nuevo Vallarta', 2400], ['Hospital', 'Hospital Joya Nuevo Vallarta', 3000]],
    contact: { type: 'whatsapp', value: '3229876543' },
    photoSeed: 'nuevovallarta',
    estimation: null,
  },
  {
    owner: 'carlos',
    type: 'Terreno',
    title: 'Terreno campestre en Las Palmas',
    description: 'Una hectárea con árboles frutales, ojo de agua y acceso por camino de terracería. Ideal para rancho o huerta.',
    price: 2300000,
    status: 'active',
    features: { land: 10000, frontage: 80, depth: 125 },
    location: { street: 'Camino a Las Palmas', ext: 's/n', neighborhood: 'Las Palmas', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48400', lat: 20.7695, lng: -105.0718 },
    services: RURAL,
    nearby: [['Escuela', 'Escuela Rural Las Palmas', 1900], ['Gasolinera', 'Gasolinera Las Palmas', 2600]],
    contact: { type: 'phone', value: '3229876543' },
    photoSeed: 'laspalmas',
    estimation: null,
  },
  {
    owner: 'carlos',
    type: 'Casa',
    title: 'Casa vendida en Versalles',
    description: 'Publicación retirada porque la propiedad ya se vendió.',
    price: 3800000,
    status: 'withdrawn',
    features: { land: 160, frontage: 8, depth: 20, construction: { built: 140, floors: 2, bedrooms: 3, bathrooms: 2.5, parking: 1, age: 20, condition: 'regular', quality: 'media' } },
    location: { street: 'Calle Francia', ext: '210', neighborhood: 'Versalles', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48310', lat: 20.6395, lng: -105.2312 },
    services: URBAN,
    nearby: [],
    contact: { type: 'phone', value: '3229876543' },
    photoSeed: 'versalles',
    estimation: null,
  },
  {
    owner: 'bahia',
    type: 'Casa',
    title: 'Villa en Conchas Chinas con vista al océano',
    description:
      'Villa de lujo con alberca infinita, cinco recámaras con baño propio, elevador y terrazas en cada nivel. A cinco minutos de la Zona Romántica.',
    price: 24500000,
    status: 'active',
    features: { land: 650, frontage: 20, depth: 32.5, construction: { built: 520, floors: 3, bedrooms: 5, bathrooms: 5.5, parking: 3, age: 6, condition: 'excelente', quality: 'lujo' } },
    location: { street: 'Calle Santa Barbara', ext: '19', neighborhood: 'Conchas Chinas', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48390', lat: 20.5905, lng: -105.2405 },
    services: URBAN,
    nearby: [['Parque', 'Playa Conchas Chinas', 400], ['Supermercado', 'Mercado Zona Romántica', 1800], ['Hospital', 'Hospital Amerimed', 2500]],
    contact: { type: 'email', value: 'inmobiliaria@terravalle.dev' },
    photoSeed: 'conchaschinas',
    estimation: { min: 22000000, value: 23800000, max: 26000000 },
  },
  {
    owner: 'bahia',
    type: 'Departamento',
    title: 'Departamento en el Centro, a una calle del Malecón',
    description:
      'Departamento luminoso de dos recámaras en edificio con elevador y roof garden. Caminando al Malecón, la Catedral y el mercado municipal.',
    price: 3650000,
    status: 'active',
    features: { land: 78, frontage: null, depth: null, construction: { built: 78, floors: 1, bedrooms: 2, bathrooms: 1, parking: 0, age: 18, condition: 'bueno', quality: 'media' } },
    location: { street: 'Calle Morelos', ext: '640', interior: '5', neighborhood: 'Centro', municipality: 'Puerto Vallarta', state: 'Jalisco', postalCode: '48300', lat: 20.6105, lng: -105.2338 },
    services: URBAN,
    nearby: [['Parque', 'Malecón de Puerto Vallarta', 100], ['Banco', 'Santander Centro', 250], ['Farmacia', 'Farmacia del Ahorro Centro', 200], ['Transporte', 'Parada Centro', 80]],
    contact: { type: 'whatsapp', value: '3222223344' },
    photoSeed: 'centro',
    estimation: null,
  },
  {
    owner: 'bahia',
    type: 'Terreno',
    title: 'Terreno comercial en Sayulita',
    description: 'Terreno con frente a calle principal, uso de suelo mixto. A tres calles de la playa y de la plaza de Sayulita.',
    price: 5600000,
    status: 'active',
    features: { land: 300, frontage: 12, depth: 25 },
    location: { street: 'Av. Revolución', ext: '33', neighborhood: 'Centro', municipality: 'Bahía de Banderas', state: 'Nayarit', postalCode: '63842', lat: 20.8688, lng: -105.4408 },
    services: SUBURBAN,
    nearby: [['Parque', 'Playa Sayulita', 350], ['Farmacia', 'Farmacia Sayulita', 150], ['Banco', 'Cajero Banamex Sayulita', 200]],
    contact: { type: 'phone', value: '3222223344' },
    photoSeed: 'sayulita',
    estimation: null,
  },
];

/** Propiedades (por título) que la cuenta compradora tiene en favoritos. */
const FAVORITES = [
  'Casa con alberca en Marina Vallarta',
  'Terreno con vista a la bahía en Mismaloya',
  'Departamento en el Centro, a una calle del Malecón',
  'Lote en preventa en Las Moras', // inactiva: la relación existe pero no aparece en la lista
];

/* ------------------------------------------------------------------ helpers */

function assertDevDatabase(connectionString) {
  if (!connectionString) {
    throw new Error('Configura MIGRATION_DATABASE_URL en el archivo .env (base de desarrollo).');
  }
  const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_dev')) {
    throw new Error(
      `Por seguridad este script solo corre contra una base terminada en "_dev" (recibió "${databaseName}").`,
    );
  }
  return databaseName;
}

async function idsByName(client, table) {
  const { rows } = await client.query(`SELECT id, name FROM ${table}`);
  return new Map(rows.map((row) => [row.name, row.id]));
}

function formattedAddress(location) {
  const street = [location.street, location.ext].filter(Boolean).join(' ');
  return [street, location.neighborhood, `${location.postalCode} ${location.municipality}`, location.state]
    .filter(Boolean)
    .join(', ');
}

function estimationFactors(property) {
  const factors = [
    ['Superficie de terreno', `${property.features.land} m²`, 'neutral', 'Base del cálculo junto con el precio por m² de la zona.'],
    ['Ubicación', `${property.location.neighborhood}, ${property.location.municipality}`, 'positive', 'Zona con alta demanda turística y residencial.'],
    ['Servicios', `${property.services.length} de 8 servicios`, property.services.length >= 6 ? 'positive' : 'negative', 'Disponibilidad de servicios básicos e infraestructura.'],
  ];
  if (property.features.construction) {
    const { construction } = property.features;
    factors.push([
      'Construcción',
      `${construction.built} m² · calidad ${construction.quality}`,
      'positive',
      'Superficie construida y calidad de acabados.',
    ]);
    factors.push(['Antigüedad', `${construction.age} años`, construction.age > 15 ? 'negative' : 'neutral', 'Depreciación estimada por años de uso.']);
  }
  return factors;
}

/* ------------------------------------------------------------------ carga */

async function seed(client) {
  // 1. Limpia lo cargado antes (las propiedades se borran en cascada con sus relaciones).
  await client.query(
    `DELETE FROM properties WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%' || $1)`,
    [SEED_DOMAIN],
  );
  await client.query(`DELETE FROM ai_estimations WHERE requested_by IN (SELECT id FROM users WHERE email LIKE '%' || $1)`, [SEED_DOMAIN]);
  await client.query(`DELETE FROM users WHERE email LIKE '%' || $1`, [SEED_DOMAIN]);

  // 2. Usuarios.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const userIds = new Map();
  for (const user of USERS) {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, contact_email)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [user.name, user.email, passwordHash, user.phone, user.phone ? user.email : null],
    );
    userIds.set(user.key, rows[0].id);
  }

  const typeIds = await idsByName(client, 'property_types');
  const serviceIds = await idsByName(client, 'services');
  const categoryIds = await idsByName(client, 'nearby_place_categories');
  const propertyIds = new Map();

  // 3. Propiedades con todas sus secciones.
  for (const [index, property] of PROPERTIES.entries()) {
    const publishedAt = property.status === 'draft' ? null : new Date(Date.now() - (index + 1) * 36 * 3600 * 1000);
    const { rows } = await client.query(
      `INSERT INTO properties (owner_id, property_type_id, title, description, publication_price, status, published_at, withdrawn_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        userIds.get(property.owner),
        typeIds.get(property.type),
        property.title,
        property.description,
        property.price,
        property.status,
        publishedAt,
        property.status === 'withdrawn' ? new Date() : null,
      ],
    );
    const propertyId = rows[0].id;
    propertyIds.set(property.title, propertyId);

    if (property.features) {
      const construction = property.features.construction;
      await client.query(
        `INSERT INTO property_features (property_id, land_area_m2, frontage_m, depth_m, has_construction,
           built_area_m2, bedrooms, bathrooms, floors, parking_spaces, age_years, general_condition, construction_quality)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          propertyId,
          property.features.land,
          property.features.frontage,
          property.features.depth,
          Boolean(construction),
          construction?.built ?? null,
          construction?.bedrooms ?? null,
          construction?.bathrooms ?? null,
          construction?.floors ?? null,
          construction?.parking ?? null,
          construction?.age ?? null,
          construction?.condition ?? null,
          construction?.quality ?? null,
        ],
      );
    }

    if (property.location) {
      const location = property.location;
      await client.query(
        `INSERT INTO property_locations (property_id, street, exterior_number, interior_number, neighborhood,
           municipality, state, postal_code, country, latitude, longitude, formatted_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'México', $9, $10, $11)`,
        [
          propertyId,
          location.street,
          location.ext,
          location.interior ?? null,
          location.neighborhood,
          location.municipality,
          location.state,
          location.postalCode,
          location.lat,
          location.lng,
          formattedAddress(location),
        ],
      );
    }

    for (const service of property.services) {
      await client.query('INSERT INTO property_services (property_id, service_id) VALUES ($1, $2)', [
        propertyId,
        serviceIds.get(service),
      ]);
    }

    for (const [category, name, distance] of property.nearby) {
      await client.query(
        `INSERT INTO nearby_places (property_id, category_id, name, approximate_distance_m, provider)
         VALUES ($1, $2, $3, $4, 'manual')`,
        [propertyId, categoryIds.get(category), name, distance],
      );
    }

    if (property.contact) {
      await client.query(
        `INSERT INTO property_contact_channels (property_id, channel_type, contact_value) VALUES ($1, $2, $3)`,
        [propertyId, property.contact.type, property.contact.value],
      );
    }

    if (property.photoSeed) {
      for (const [order, url] of photos(property.photoSeed).entries()) {
        await client.query(
          `INSERT INTO property_photos (property_id, image_url, mime_type, is_primary, sort_order)
           VALUES ($1, $2, 'image/jpeg', $3, $4)`,
          [propertyId, url, order === 0, order],
        );
      }
    }

    if (property.estimation) {
      const { rows: estimationRows } = await client.query(
        `INSERT INTO ai_estimations (property_id, requested_by, estimated_value, estimated_min, estimated_max,
           explanation, model_name, model_version)
         VALUES ($1, $2, $3, $4, $5, $6, 'terravalle-valuador', '1.1.0') RETURNING id`,
        [
          propertyId,
          userIds.get(property.owner),
          property.estimation.value,
          property.estimation.min,
          property.estimation.max,
          'Estimación de prueba generada por el script de datos de desarrollo.',
        ],
      );
      for (const [name, value, impact, explanation] of estimationFactors(property)) {
        await client.query(
          `INSERT INTO ai_estimation_factors (estimation_id, factor_name, factor_value, impact, explanation)
           VALUES ($1, $2, $3, $4, $5)`,
          [estimationRows[0].id, name, value, impact, explanation],
        );
      }
    }
  }

  // 4. Favoritos de la cuenta compradora.
  for (const title of FAVORITES) {
    await client.query('INSERT INTO favorites (user_id, property_id) VALUES ($1, $2)', [
      userIds.get('laura'),
      propertyIds.get(title),
    ]);
  }

  return { users: USERS.length, properties: PROPERTIES.length, favorites: FAVORITES.length };
}

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  const databaseName = assertDevDatabase(connectionString);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const totals = await seed(client);
    await client.query('COMMIT');

    const active = PROPERTIES.filter((property) => property.status === 'active').length;
    console.log(`\nDatos de prueba cargados en ${databaseName}:`);
    console.log(`  ${totals.users} usuarios · ${totals.properties} propiedades (${active} activas) · ${totals.favorites} favoritos`);
    console.log(`\nContraseña de todas las cuentas: ${SEED_PASSWORD}`);
    for (const user of USERS) console.log(`  ${user.email.padEnd(30)} ${user.name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nNo se cargaron los datos: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { assertDevDatabase, PROPERTIES, USERS, FAVORITES };
