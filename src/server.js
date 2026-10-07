require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('./config/database');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.get('/', (_req, res) => {
  res.json({
    message: 'TerraValle API funcionando',
  });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

app.use('/api/auth', authRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: 'Ruta no encontrada.',
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      message: 'El cuerpo de la solicitud debe ser JSON válido.',
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'El cuerpo de la solicitud es demasiado grande.',
    });
  }

  console.error(error);
  return res.status(500).json({
    message: 'Error interno del servidor.',
  });
});

async function startServer() {
  try {
    await connectDatabase();

    return app.listen(PORT, () => {
      console.log(
        `TerraValle API ejecutándose en http://localhost:${PORT}`,
      );
    });
  } catch (error) {
    console.error(
      'No se pudo iniciar el servidor:',
      error.message,
    );

    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
