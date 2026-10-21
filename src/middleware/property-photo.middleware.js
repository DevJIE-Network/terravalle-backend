const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDirectory = path.join(
  process.cwd(),
  'uploads',
  'properties',
);

fs.mkdirSync(uploadDirectory, {
  recursive: true,
});

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (_req, file, callback) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const uniqueName =
      `${Date.now()}-${crypto.randomUUID()}${extension}`;

    callback(null, uniqueName);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return callback(
      new Error(
        'Solo se permiten imágenes JPG, PNG o WebP.',
      ),
    );
  }

  return callback(null, true);
}

const uploadPropertyPhotos = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
});

module.exports = {
  uploadPropertyPhotos,
};