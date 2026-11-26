const express = require('express');
const { publicRevalidate } = require('../middleware/cache-control.middleware');
const { listServices } = require('../controllers/service.controller');

const router = express.Router();

/**
 * HU-006
 * Catálogo de servicios del inmueble (agua potable, electricidad, drenaje, etc.).
 * Es público: no contiene datos personales y lo usan los formularios y la ficha.
 */
router.get('/', publicRevalidate, listServices);

module.exports = router;
