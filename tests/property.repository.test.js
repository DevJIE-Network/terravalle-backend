const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadWithMockedDatabase } = require('./repository-mock');

const REPO = '../src/repositories/property.repository';

const PROPERTY_ROW = {
  id: '9007199254740993',
  owner_id: '42',
  property_type_id: '2',
  title: 'Casa en Tula',
  description: 'Dos plantas',
  publication_price: '1500000.50',
  status: 'draft',
  published_at: null,
  withdrawn_at: null,
  deleted_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-02T00:00:00.000Z',
};

const PROPERTY = {
  id: '9007199254740993',
  ownerId: '42',
  propertyTypeId: 2,
  title: 'Casa en Tula',
  description: 'Dos plantas',
  publicationPrice: 1500000.5,
  status: 'draft',
  publishedAt: null,
  withdrawnAt: null,
  deletedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

const FEATURES_ROW = {
  property_id: '7',
  land_area_m2: '200.50',
  frontage_m: '10.00',
  depth_m: null,
  has_construction: true,
  built_area_m2: '150.00',
  bedrooms: 3,
  bathrooms: '2.5',
  floors: 2,
  parking_spaces: 1,
  age_years: 5,
  general_condition: 'bueno',
  construction_quality: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-02T00:00:00.000Z',
};

const FEATURES = {
  propertyId: '7',
  landArea: 200.5,
  frontage: 10,
  depth: null,
  hasConstruction: true,
  builtArea: 150,
  bedrooms: 3,
  bathrooms: 2.5,
  floors: 2,
  parkingSpaces: 1,
  constructionAge: 5,
  generalCondition: 'bueno',
  constructionQuality: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

// ------------------------------------------------------------------ HU-004 · propiedades

test('property.repository findPropertyById excluye eliminadas y valida el id', async (t) => {
  const { repository, query, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, { rows: [PROPERTY_ROW] }, { rows: [] });

  assert.equal(await repository.findPropertyById('abc'), null);
  assert.equal(query.mock.callCount(), 0);

  assert.deepEqual(await repository.findPropertyById('9007199254740993'), PROPERTY);
  assert.match(sqlAt(0), /FROM properties WHERE id = \$1 AND deleted_at IS NULL LIMIT 1$/);
  assert.deepEqual(paramsAt(0), ['9007199254740993']);

  assert.equal(await repository.findPropertyById('8'), null);
});

test('property.repository convierte un precio nulo en null', async (t) => {
  const { repository } = loadWithMockedDatabase(t, REPO, { rows: [{ ...PROPERTY_ROW, publication_price: null }] });

  assert.equal((await repository.findPropertyById('7')).publicationPrice, null);
});

test('property.repository findPropertyTypeById devuelve el tipo o null', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(
    t,
    REPO,
    { rows: [{ id: '2', name: 'Casa', description: null, is_active: true }] },
    { rows: [] },
  );

  assert.deepEqual(await repository.findPropertyTypeById(2), {
    id: 2,
    name: 'Casa',
    description: null,
    isActive: true,
  });
  assert.match(sqlAt(0), /FROM property_types WHERE id = \$1 LIMIT 1$/);
  assert.deepEqual(paramsAt(0), [2]);
  assert.equal(await repository.findPropertyTypeById(99), null);
});

test('property.repository createProperty inserta y normaliza opcionales vacíos', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, { rows: [PROPERTY_ROW] }, { rows: [PROPERTY_ROW] });

  const property = await repository.createProperty({
    ownerId: '42',
    propertyTypeId: 2,
    title: 'Casa en Tula',
    description: 'Dos plantas',
    publicationPrice: 1500000.5,
  });

  assert.deepEqual(property, PROPERTY);
  assert.match(sqlAt(0), /^INSERT INTO properties \( owner_id, property_type_id, title, description, publication_price \) VALUES \(\$1, \$2, \$3, \$4, \$5\) RETURNING/);
  assert.deepEqual(paramsAt(0), ['42', 2, 'Casa en Tula', 'Dos plantas', 1500000.5]);

  await repository.createProperty({ ownerId: '42', propertyTypeId: 1, title: 'Terreno', description: '' });
  assert.deepEqual(paramsAt(1), ['42', 1, 'Terreno', null, null]);
});

test('property.repository createPhoto guarda la foto y devuelve su metadato', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, {
    rows: [{
      id: '11',
      property_id: '7',
      image_url: '/uploads/properties/a.jpg',
      storage_key: 'properties/a.jpg',
      mime_type: 'image/jpeg',
      file_size_bytes: '2048',
      is_primary: true,
      sort_order: 0,
      created_at: '2026-10-01T00:00:00.000Z',
    }],
  });

  const photo = await repository.createPhoto({
    propertyId: '7',
    imageUrl: '/uploads/properties/a.jpg',
    storageKey: 'properties/a.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 2048,
    isPrimary: true,
    sortOrder: 0,
  });

  assert.deepEqual(photo, {
    id: '11',
    propertyId: '7',
    imageUrl: '/uploads/properties/a.jpg',
    storageKey: 'properties/a.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 2048,
    isPrimary: true,
    sortOrder: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  assert.match(sqlAt(0), /^INSERT INTO property_photos \(/);
  assert.deepEqual(paramsAt(0), ['7', '/uploads/properties/a.jpg', 'properties/a.jpg', 'image/jpeg', 2048, true, 0]);
});

// ------------------------------------------------------------------ HU-005 · características

test('property.repository findCharacteristicsByPropertyId mapea o devuelve null', async (t) => {
  const { repository, query, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, { rows: [FEATURES_ROW] }, { rows: [] });

  assert.equal(await repository.findCharacteristicsByPropertyId('x'), null);
  assert.equal(query.mock.callCount(), 0);

  assert.deepEqual(await repository.findCharacteristicsByPropertyId('7'), FEATURES);
  assert.match(sqlAt(0), /FROM property_features WHERE property_id = \$1$/);
  assert.deepEqual(paramsAt(0), ['7']);

  assert.equal(await repository.findCharacteristicsByPropertyId('8'), null);
});

test('property.repository upsertCharacteristics inserta o actualiza en una sentencia', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, { rows: [FEATURES_ROW] }, { rows: [FEATURES_ROW] });
  const data = {
    landArea: 200.5,
    frontage: 10,
    depth: null,
    hasConstruction: true,
    builtArea: 150,
    bedrooms: 3,
    bathrooms: 2.5,
    floors: 2,
    parkingSpaces: 1,
    constructionAge: 5,
    generalCondition: 'bueno',
  };

  assert.deepEqual(await repository.upsertCharacteristics('7', data), FEATURES);
  assert.match(sqlAt(0), /^INSERT INTO property_features \(/);
  assert.match(sqlAt(0), /ON CONFLICT \(property_id\) DO UPDATE SET land_area_m2 = EXCLUDED\.land_area_m2/);
  assert.match(sqlAt(0), /construction_quality = EXCLUDED\.construction_quality RETURNING/);
  assert.deepEqual(paramsAt(0), ['7', 200.5, 10, null, true, 150, 3, 2.5, 2, 1, 5, 'bueno', null]);

  await repository.upsertCharacteristics('7', { ...data, constructionQuality: 'lujo' });
  assert.equal(paramsAt(1)[12], 'lujo');
});

// ------------------------------------------------------------------ HU-008 · panel del vendedor

test('property.repository countPropertiesByOwnerId filtra por dueño y estado opcional', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, { rows: [{ total: '3' }] }, { rows: [{ total: '1' }] });

  assert.equal(await repository.countPropertiesByOwnerId('42'), 3);
  assert.match(sqlAt(0), /WHERE owner_id = \$1 AND deleted_at IS NULL AND \(\$2::varchar IS NULL OR status = \$2::varchar\)$/);
  assert.deepEqual(paramsAt(0), ['42', null]);

  assert.equal(await repository.countPropertiesByOwnerId('42', 'active'), 1);
  assert.deepEqual(paramsAt(1), ['42', 'active']);
});

test('property.repository findPropertiesByOwnerId pagina de la más reciente a la más antigua', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, { rows: [PROPERTY_ROW] }, { rows: [] });

  assert.deepEqual(await repository.findPropertiesByOwnerId('42'), [PROPERTY]);
  assert.match(sqlAt(0), /ORDER BY created_at DESC, id DESC LIMIT \$3 OFFSET \$4$/);
  assert.deepEqual(paramsAt(0), ['42', null, 20, 0]);

  assert.deepEqual(await repository.findPropertiesByOwnerId('42', { status: 'inactive', limit: 5, offset: 10 }), []);
  assert.deepEqual(paramsAt(1), ['42', 'inactive', 5, 10]);
});

test('property.repository updateProperty solo cambia campos editables del dueño', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(t, REPO, { rows: [{ ...PROPERTY_ROW, title: 'Casa nueva' }] }, { rows: [] });

  const updated = await repository.updateProperty('7', '42', {
    title: 'Casa nueva',
    publicationPrice: 990000,
    status: 'active',
    ownerId: '1',
  });

  assert.equal(updated.title, 'Casa nueva');
  assert.match(sqlAt(0), /^UPDATE properties SET title = \$3, publication_price = \$4 WHERE id = \$1 AND owner_id = \$2 AND deleted_at IS NULL AND status <> 'withdrawn' RETURNING/);
  assert.deepEqual(paramsAt(0), ['7', '42', 'Casa nueva', 990000]);

  assert.equal(await repository.updateProperty('7', '99', { description: 'x' }), null);
});

test('property.repository updateProperty sin campos editables falla', async (t) => {
  const { repository, query } = loadWithMockedDatabase(t, REPO);

  await assert.rejects(
    repository.updateProperty('7', '42', { status: 'active' }),
    /updateProperty requiere al menos un campo editable/,
  );
  assert.equal(query.mock.callCount(), 0);
});

test('property.repository changePropertyStatus cambia el estado y registra el historial', async (t) => {
  const { repository, sqlAt, paramsAt } = loadWithMockedDatabase(
    t,
    REPO,
    { rows: [{ ...PROPERTY_ROW, status: 'active' }] },
    { rows: [] },
  );

  const property = await repository.changePropertyStatus({
    propertyId: '7',
    ownerId: '42',
    previousStatus: 'draft',
    newStatus: 'active',
  });

  assert.equal(property.status, 'active');
  assert.match(sqlAt(0), /^WITH updated AS \( UPDATE properties SET status = \$3::varchar/);
  assert.match(sqlAt(0), /AND status = \$4::varchar AND deleted_at IS NULL/);
  assert.match(sqlAt(0), /history AS \( INSERT INTO property_status_history/);
  assert.deepEqual(paramsAt(0), ['7', '42', 'active', 'draft', null]);

  const stale = await repository.changePropertyStatus({
    propertyId: '7',
    ownerId: '42',
    previousStatus: 'active',
    newStatus: 'withdrawn',
    reason: 'Vendida',
  });
  assert.equal(stale, null);
  assert.deepEqual(paramsAt(1), ['7', '42', 'withdrawn', 'active', 'Vendida']);
});
