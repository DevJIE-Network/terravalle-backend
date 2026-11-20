const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const propertyRepository = require('../src/repositories/property.repository');
const { app } = require('../src/server');

/*
 * Contacto con el vendedor, probado por HTTP real y sin variables globales:
 * asegura que el controlador valide el id con el repositorio (antes respondía 500).
 */

let baseUrl;
let server;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (!server) return undefined;
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

const request = (id) => fetch(`${baseUrl}/api/properties/${id}/contact`);

test('contacto: un id inválido responde 400 sin consultar la base', async (t) => {
  const findProperty = t.mock.method(propertyRepository, 'findPropertyById', async () => null);

  const response = await request('abc');

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: 'El identificador de propiedad no es válido.',
  });
  assert.equal(findProperty.mock.callCount(), 0);
});

test('contacto: una propiedad activa devuelve solo el tipo y el valor', async (t) => {
  t.mock.method(propertyRepository, 'findPropertyById', async () => ({
    id: '7',
    ownerId: '42',
    status: 'active',
  }));
  t.mock.method(propertyRepository, 'findContactChannelsByPropertyId', async () => [
    { id: '1', channelType: 'whatsapp', contactValue: '3221234567' },
  ]);

  const response = await request('7');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    contact: { type: 'whatsapp', value: '3221234567' },
  });
});
