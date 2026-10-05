require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDatabase = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const User = require('./models/User');

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada.' });
});

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'El cuerpo de la solicitud debe ser JSON válido.' });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'El cuerpo de la solicitud es demasiado grande.' });
  }

  console.error('Error del servidor:', error.message);
  return res.status(500).json({ message: 'Error interno del servidor.' });
});

async function startServer() {
  const port = Number(process.env.PORT || 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un número entero entre 1 y 65535.');
  }

  await connectDatabase();
  await User.init();

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, () => resolve(listener));
    listener.once('error', reject);
  });

  console.log(`API TerraValle disponible en http://localhost:${port}`);
  return server;
}

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error('No se pudo iniciar el servidor:', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
