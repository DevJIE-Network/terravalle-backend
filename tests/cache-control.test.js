const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const detailRepository = require('../src/repositories/property-detail.repository');
const serviceRepository = require('../src/repositories/service.repository');
const { CACHE_POLICIES } = require('../src/middleware/cache-control.middleware');
const { app } = require('../src/server');

let baseUrl;
let server;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (!server) return;
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

function mockDetail(t, status = 'active') {
  t.mock.method(detailRepository, 'findPropertyForDetail', async () => ({ id: '7', status }));
  t.mock.method(detailRepository, 'findDetailRelations', async () => ({}));
  t.mock.method(detailRepository, 'toPropertyDetail', () => ({ id: '7', title: 'Casa en Tula' }));
}

test('la ficha pública se puede guardar pero siempre se revalida', async (t) => {
  mockDetail(t);

  const response = await fetch(`${baseUrl}/api/properties/7`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), CACHE_POLICIES.PUBLIC_REVALIDATE);
  assert.ok(response.headers.get('etag'), 'debe incluir ETag para revalidar');
});

test('si la ficha no cambió responde 304 sin cuerpo', async (t) => {
  mockDetail(t);

  const first = await fetch(`${baseUrl}/api/properties/7`);
  const etag = first.headers.get('etag');
  // Se usa http y no fetch: fetch agrega "Cache-Control: no-cache" al enviar If-None-Match,
  // y eso obliga al servidor a responder completo. El navegador, al revalidar su caché, no lo hace.
  const second = await new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}/api/properties/7`, { headers: { 'If-None-Match': etag } }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });

  assert.equal(second.status, 304);
  assert.equal(second.body, '');
});

test('una ficha retirada (410) o inexistente (404) no se guarda', async (t) => {
  mockDetail(t, 'withdrawn');
  const gone = await fetch(`${baseUrl}/api/properties/7`);
  assert.equal(gone.status, 410);
  assert.equal(gone.headers.get('cache-control'), CACHE_POLICIES.NO_STORE);

  const missing = await fetch(`${baseUrl}/api/properties/abc`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), CACHE_POLICIES.NO_STORE);
});

test('el catálogo de servicios es público y se revalida', async (t) => {
  t.mock.method(serviceRepository, 'listActiveServices', async () => [
    { id: 1, name: 'Agua potable', description: null },
  ]);

  const response = await fetch(`${baseUrl}/api/services`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), CACHE_POLICIES.PUBLIC_REVALIDATE);
});

test('datos de sesión, favoritos y contacto nunca se guardan', async () => {
  const favorites = await fetch(`${baseUrl}/api/favorites`);
  assert.equal(favorites.status, 401);
  assert.equal(favorites.headers.get('cache-control'), CACHE_POLICIES.NO_STORE);

  const me = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(me.headers.get('cache-control'), CACHE_POLICIES.NO_STORE);

  const contact = await fetch(`${baseUrl}/api/properties/abc/contact`);
  assert.equal(contact.headers.get('cache-control'), CACHE_POLICIES.NO_STORE);
});

test('las rutas que modifican datos no se guardan', async () => {
  const response = await fetch(`${baseUrl}/api/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), CACHE_POLICIES.NO_STORE);
});
