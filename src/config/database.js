const mongoose = require('mongoose');

async function connectDatabase(mongoUri = process.env.MONGODB_URI) {
  const databaseName = process.env.MONGODB_DBNAME || 'terravalley';

  if (!mongoUri) {
    throw new Error('Configura MONGODB_URI en el archivo .env.');
  }

  await mongoose.connect(mongoUri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
  });

  console.log(
    `MongoDB conectado correctamente: ${mongoose.connection.name}`,
  );

  return mongoose.connection;
}

module.exports = {
  connectDatabase,
};
