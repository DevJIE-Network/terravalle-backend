require('dotenv').config();

const express = require('express');
const cors = require('cors');

const {
  connectDatabase,
} = require('./config/database');

const authRoutes = require('./routes/auth.routes');

const app = express();

const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    message: 'TerraValle API funcionando',
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'TerraValle API',
  });
});

// Autenticación
app.use('/api/auth', authRoutes);

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(
        `TerraValle API ejecutándose en http://localhost:${PORT}`,
      );
    });
  } catch (error) {
    console.error(
      'No se pudo iniciar el servidor:',
      error.message,
    );

    process.exit(1);
  }
}

startServer();