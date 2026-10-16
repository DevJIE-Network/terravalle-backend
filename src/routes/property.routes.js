const express = require('express');

const {
  createProperty,
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

module.exports = router;