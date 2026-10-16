const { verifyAccessToken } = require('../utils/jwt');
const userRepository = require('../repositories/user.repository');

async function requireAuth(req, res, next) {
  const authorization = req.get('Authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      message: 'Sesión no válida o expirada.',
    });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await userRepository.findById(payload.sub);

    if (!user || user.isActive === false) {
      return res.status(401).json({
        message: 'Sesión no válida o expirada.',
      });
    }

    req.auth = {
      user,
      userId: user.id,
    };

    return next();
  } catch (_error) {
    return res.status(401).json({
      message: 'Sesión no válida o expirada.',
    });
  }
}

module.exports = { requireAuth };
