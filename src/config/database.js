const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    throw new Error('La base de datos no está conectada. Llama a connectDatabase() primero.');
  }

  return pool;
}

async function connectDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('Configura DATABASE_URL en el archivo .env.');
  }

  const newPool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  try {
    await newPool.query('SELECT 1');
  } catch (error) {
    await newPool.end();
    throw error;
  }

  pool = newPool;
  console.log('PostgreSQL conectado correctamente.');

  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  connectDatabase,
  closeDatabase,
  query,
};
