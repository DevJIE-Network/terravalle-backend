const serviceRepository = require('../repositories/service.repository');

/**
 * HU-006
 * GET /api/services
 * Catálogo de servicios disponibles para seleccionar en una propiedad.
 */
async function listServices(_req, res, next) {
  try {
    const services = await serviceRepository.listActiveServices();
    return res.status(200).json({ services });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listServices };
