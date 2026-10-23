const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { app } = require('../src/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const health = (origin) =>
  fetch(`${baseUrl}/api/health`, origin ? { headers: { Origin: origin } } : {});

test('CORS: permite el frontend de producción', async () => {
  const origin = 'https://wonderful-pebble-0c19df21e.2.azurestaticapps.net';
  const res = await health(origin);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), origin);
});

test('CORS: permite el frontend local de desarrollo', async () => {
  const res = await health('http://localhost:5173');
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('CORS: no autoriza orígenes desconocidos', async () => {
  const res = await health('https://sitio-malicioso.example');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('CORS: solicitudes sin Origin (health check) siguen funcionando', async () => {
  const res = await health();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});
