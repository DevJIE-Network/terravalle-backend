/**
 * Muestra qué migraciones están aplicadas y cuáles están pendientes.
 * Uso: npm run migrate:status
 *
 * Compara los archivos de la carpeta migrations/ con la tabla pgmigrations, donde
 * node-pg-migrate registra cada migración ejecutada y la fecha en que se aplicó.
 */
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const connectionString = process.env.MIGRATION_DATABASE_URL;

async function main() {
  if (!connectionString) {
    throw new Error('Configura MIGRATION_DATABASE_URL en el archivo .env (base de desarrollo).');
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /\.(c?js|sql)$/.test(file))
    .map((file) => file.replace(/\.(c?js|sql)$/, ''))
    .sort();

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: [{ exists }] } = await client.query(
      "SELECT to_regclass('public.pgmigrations') IS NOT NULL AS exists",
    );

    const applied = new Map();
    if (exists) {
      const { rows } = await client.query('SELECT name, run_on FROM pgmigrations ORDER BY id');
      rows.forEach((row) => applied.set(row.name, row.run_on));
    }

    const database = new URL(connectionString).pathname.slice(1);
    console.log(`\nBase de datos: ${database}\n`);

    for (const name of files) {
      const runOn = applied.get(name);
      const state = runOn ? `APLICADA  ${runOn.toISOString()}` : 'PENDIENTE';
      console.log(`  ${runOn ? '[x]' : '[ ]'} ${name.padEnd(48)} ${state}`);
    }

    const pending = files.filter((name) => !applied.has(name)).length;
    console.log(`\n${files.length - pending} aplicadas · ${pending} pendientes\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`No se pudo consultar el estado de las migraciones: ${error.message}`);
  process.exitCode = 1;
});
