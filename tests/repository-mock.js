const database = require('../src/config/database');

/** Normaliza espacios para comparar el SQL emitido. */
const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();

/**
 * Simula database.query con las respuestas indicadas (en orden) y carga de nuevo el
 * repositorio para que tome el mock: los repositorios que desestructuran `query`
 * conservan la referencia que tenían al momento del require.
 *
 * @param {import('node:test').TestContext} t
 * @param {string} modulePath ruta del repositorio desde tests/
 * @param {...{ rows: object[] }} results respuestas de cada llamada
 */
function loadWithMockedDatabase(t, modulePath, ...results) {
  let call = 0;
  const query = t.mock.method(database, 'query', async () => results[call++] ?? { rows: [] });

  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  const repository = require(resolved);
  t.after(() => {
    delete require.cache[resolved];
  });

  const sqlAt = (index) => normalize(query.mock.calls[index].arguments[0]);
  const paramsAt = (index) => query.mock.calls[index].arguments[1];

  return { repository, query, sqlAt, paramsAt };
}

module.exports = { loadWithMockedDatabase, normalize };
