const mongoose = require('mongoose');

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  const databaseName =
    process.env.MONGODB_DBNAME || 'terravalley';

  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI no está configurada en el archivo .env',
    );
  }

  await mongoose.connect(mongoUri, {
    dbName: databaseName,
  });

  console.log(
    `MongoDB conectado correctamente: ${mongoose.connection.name}`,
  );
}

module.exports = {
  connectDatabase,
};