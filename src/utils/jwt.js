const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET debe estar configurado y tener al menos 32 caracteres.');
  }

  return secret;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

module.exports = { signAccessToken, verifyAccessToken };
