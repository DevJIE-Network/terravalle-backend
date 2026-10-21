const express = require('express');

const {
  createProperty,
  uploadPhotos,
} = require('../controllers/property.controller');

const {
  requireAuth,
} = require('../middleware/auth.middleware');

const {
  uploadPropertyPhotos,
} = require('../middleware/property-photo.middleware');

const router = express.Router();

router.post(
  '/',
  requireAuth,
  createProperty,
);

router.post(
  '/:propertyId/photos',
  requireAuth,
  uploadPropertyPhotos.array(
    'photos',
    10,
  ),
  uploadPhotos,
);

module.exports = router;