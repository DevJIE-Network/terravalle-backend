const express = require('express');

const {
  createProperty,
  saveCharacteristics,
  getCharacteristics,
} = require('../controllers/property.controller');

const {
  requireAuth,
} = require('../middleware/auth.middleware');

const router = express.Router();

router.post(
  '/',
  requireAuth,
  createProperty,
);

// HU-005: dimensiones del terreno y características de construcción.
router.get(
  '/:id/characteristics',
  requireAuth,
  getCharacteristics,
);

router.put(
  '/:id/characteristics',
  requireAuth,
  saveCharacteristics,
);

module.exports = router;
