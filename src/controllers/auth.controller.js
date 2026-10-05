const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { registerSchema } = require('../schemas/auth.schema');

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

module.exports = { register };
