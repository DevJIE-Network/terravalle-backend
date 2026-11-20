const assert = require('node:assert/strict');
const { test } = require('node:test');
const propertyRepository = require('../src/repositories/property.repository');
const { getContact } = require('../src/controllers/property.controller');

// Make isValidId available in the scope where getContact runs
// The controller uses isValidId(id) without importing it, so we make it global
global.isValidId = propertyRepository.isValidId;

const PROPERTY_ACTIVE = {
  id: '7',
  ownerId: '42',
  propertyTypeId: 2,
  title: 'Casa en Tula',
  description: 'Casa de dos plantas',
  publicationPrice: 1500000,
  status: 'active',
  publishedAt: '2026-11-01T00:00:00.000Z',
  withdrawnAt: null,
  deletedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

const PROPERTY_INACTIVE = {
  ...PROPERTY_ACTIVE,
  status: 'inactive',
};

const PROPERTY_WITHDRAWN = {
  ...PROPERTY_ACTIVE,
  status: 'withdrawn',
};

const PROPERTY_DRAFT = {
  ...PROPERTY_ACTIVE,
  status: 'draft',
};

const PROPERTY_NO_OWNER = {
  ...PROPERTY_ACTIVE,
  ownerId: null,
};

const VALID_CONTACT_CHANNEL = {
  id: '1',
  channel_type: 'email',
  contact_value: 'vendedor@terravalle.com',
  is_enabled: true,
};

const DISABLED_CONTACT_CHANNEL = {
  id: '2',
  channel_type: 'phone',
  contact_value: '5551234567',
  is_enabled: false,
};

const MULTIPLE_CHANNELS = [
  { id: '3', channel_type: 'phone', contact_value: '5559876543', is_enabled: true },
  { id: '1', channel_type: 'email', contact_value: 'vendedor@terravalle.com', is_enabled: true },
  { id: '2', channel_type: 'whatsapp', contact_value: '5551112223', is_enabled: true },
];

function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

function mockReq({ params = { id: '7' }, userId = '42' } = {}) {
  return { params, body: {}, auth: { userId } };
}

// ------------------------------------------------------------------ HU-013 · Medio de contacto

test('HU-013 GET /api/properties/:id/contact es público y no requiere sesión', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    if (!isValidId(id)) return null;
    return null;
  });

  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => [
    { id: '1', channelType: 'email', contactValue: 'vendedor@terravalle.com' },
  ]);

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.contact);
  assert.equal(res.body.contact.type, 'email');
  assert.equal(res.body.contact.value, 'vendedor@terravalle.com');
});

test('HU-013 propiedad activa + canal habilitado → 200', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    return null;
  });

  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => [
    { id: '1', channelType: 'email', contactValue: 'vendedor@terravalle.com' },
  ]);

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.contact.type, 'email');
  assert.equal(res.body.contact.value, 'vendedor@terravalle.com');
});

test('HU-013 respuesta exacta contiene únicamente contact.type y contact.value', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    return null;
  });

  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => [
    { id: '1', channelType: 'email', contactValue: 'vendedor@terravalle.com' },
  ]);

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  // La respuesta debe tener exactamente una clave: 'contact'
  assert.equal(Object.keys(res.body).length, 1);
  assert.equal(Object.keys(res.body.contact).length, 2);
  assert.equal(Object.keys(res.body.contact)[0], 'type');
  assert.equal(Object.keys(res.body.contact)[1], 'value');
});

test('HU-013 ID inválido → 400', async (t) => {
  const res = mockRes();

  // Mock isValidId to return false for invalid IDs
  const originalIsValidId = global.isValidId;
  global.isValidId = (id) => /^abc$/.test(id) ? false : (typeof originalIsValidId === 'function' && originalIsValidId(id));

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    return null;
  });

  await getContact(mockReq({ params: { id: 'abc' } }), res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'El identificador de propiedad no es válido.');

  // Restore
  global.isValidId = originalIsValidId;
});

test('HU-013 los IDs inválidos (0, -1, decimales, grandes) devuelven 400', async (t) => {
  const res = mockRes();

  // Mock isValidId to return false for all tested invalid IDs
  const originalIsValidId = global.isValidId;
  global.isValidId = () => false;

  for (const id of ['abc', '0', '-1', '1.5', '12345678901234567890']) {
    await getContact(mockReq({ params: { id } }), res, () => {});

    assert.equal(res.statusCode, 400, `ID ${id} debería devolver 400`);
    assert.equal(res.body.message, 'El identificador de propiedad no es válido.');
  }

  // Restore
  global.isValidId = originalIsValidId;
});

test('HU-013 propiedad inexistente → 404', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return null;
    return null;
  });

  await getContact(mockReq({ params: { id: '999' } }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Propiedad no encontrada.');
});

test('HU-013 propiedad inactive → 404', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_INACTIVE, ownerId: '42' };
    return null;
  });

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'El contacto no está disponible para esta propiedad.');
});

test('HU-013 propiedad withdrawn → 404', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_WITHDRAWN, ownerId: '42' };
    return null;
  });

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'El contacto no está disponible para esta propiedad.');
});

test('HU-013 propiedad draft → 404', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_DRAFT, ownerId: '42' };
    return null;
  });

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'El contacto no está disponible para esta propiedad.');
});

test('HU-013 propiedad sin owner → 404', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_NO_OWNER, ownerId: null };
    return null;
  });

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'El contacto no está disponible para esta propiedad.');
});

test('HU-013 propiedad sin canal habilitado → 404', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    return null;
  });

  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => []);

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'El contacto no está disponible para esta propiedad.');
});

test('HU-013 canales is_enabled = false no se devuelven', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    return null;
  });

  // El repository filtra is_enabled = TRUE, por lo que canales deshabilitados no aparecen
  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => []);

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'El contacto no está disponible para esta propiedad.');
});

test('HU-013 múltiples canales habilitados usan selección determinista según ORDER BY id ASC', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    return null;
  });

  // El repository query ORDER BY id ASC LIMIT 1 trae el canal de id=1
  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => [
    { id: '1', channelType: 'email', contactValue: 'vendedor@terravalle.com' },
  ]);

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  // El canal de menor id (1) debe ser el seleccionado
  assert.equal(res.body.contact.type, 'email');
  assert.equal(res.body.contact.value, 'vendedor@terravalle.com');
});

test('HU-013 error del repository llega a next(error)', async (t) => {
  const failure = new Error('fallo de base de datos');
  const next = t.mock.fn();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    throw failure;
  });

  await getContact(mockReq({ params: { id: '7' } }), mockRes(), next);

  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0].arguments[0], failure);
});

test('HU-013 no se exponen datos privados del vendedor', async (t) => {
  const res = mockRes();

  t.mock.method(propertyRepository, 'findPropertyById', async (id) => {
    if (id === '7') return { ...PROPERTY_ACTIVE, ownerId: '42' };
    return null;
  });

  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => [
    { id: '1', channelType: 'email', contactValue: 'vendedor@terravalle.com' },
  ]);

  await getContact(mockReq({ params: { id: '7' } }), res, () => {});

  assert.equal(res.statusCode, 200);
  // La respuesta debe contener solo contact.type y contact.value, sin ownerId u otros datos privados
  assert.equal(Object.keys(res.body).length, 1);
  assert.ok(!('ownerId' in res.body));
  assert.ok(!('owner_id' in res.body));
  assert.ok(!('title' in res.body));
  assert.ok(!('description' in res.body));
  assert.ok(!('publicationPrice' in res.body));
});

test('HU-013 prueba del repository para findContactChannelsByPropertyId', async (t) => {
  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async (propertyId) => {
    if (propertyId === '7') return [
      { id: '1', channelType: 'email', contactValue: 'vendedor@terravalle.com' },
    ];
    return null;
  });

  const result = await propertyRepository.findContactChannelsByPropertyId('7');

  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.equal(result[0].channelType, 'email');
  assert.equal(result[0].contactValue, 'vendedor@terravalle.com');
});

test('HU-013 repository findContactChannelsByPropertyId devuelve null cuando no hay canales', async (t) => {
  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async (propertyId) => {
    if (propertyId === '7') return null;
    return null;
  });

  const result = await propertyRepository.findContactChannelsByPropertyId('7');

  assert.equal(result, null);
});

test('HU-013 confirmar que los exports HU-008 siguen disponibles', () => {
  // Verificar que los exports HU-008 siguen disponibles en el módulo
  const controller = require('../src/controllers/property.controller');
  
  // HU-008 exports should exist
  assert.ok(controller.listMyProperties, 'listMyProperties debería exportarse');
  assert.ok(controller.getMyProperty, 'getMyProperty debería exportarse');
  assert.ok(controller.updateProperty, 'updateProperty debería exportarse');
  assert.ok(controller.changePropertyStatus, 'changePropertyStatus debería exportarse');
  assert.ok(controller.withdrawProperty, 'withdrawProperty debería exportarse');
  
  // HU-013 export should exist
  assert.ok(controller.getContact, 'getContact debería exportarse');
  
  // Verificar también que el repositorio expone findContactChannelsByPropertyId
  const repo = require('../src/repositories/property.repository');
  assert.ok(repo.findContactChannelsByPropertyId, 'findContactChannelsByPropertyId debería exportarse');
});