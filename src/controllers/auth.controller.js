const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { registerSchema, loginSchema } = require('../schemas/auth.schema');
const { signAccessToken } = require('../utils/jwt');

const INVALID_CREDENTIALS_MESSAGE = 'Correo o contraseña incorrectos.';

async function register(req, res, next) {
  const result = registerSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: 'Datos de registro inválidos.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const { name, email, password } = result.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    return res.status(201).json({
      message: 'Usuario registrado correctamente.',
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
    }

    return next(error);
  }
}

async function login(req, res, next) {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: 'Datos de acceso inválidos.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const { email, password } = result.data;
    const user = await User.findOne({ email }).select('+passwordHash');

    // Misma respuesta para correo inexistente, contraseña incorrecta o cuenta deshabilitada.
    if (!user || user.isActive === false) {
      return res.status(401).json({ message: INVALID_CREDENTIALS_MESSAGE });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({ message: INVALID_CREDENTIALS_MESSAGE });
    }

    const token = signAccessToken(user);

    return res.status(200).json({
      message: 'Inicio de sesión correcto.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req, res) {
  const { user } = req.auth;

  return res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}

module.exports = { register, login, me, INVALID_CREDENTIALS_MESSAGE };
