const userRepository = require('../repositories/user.repository');
const { updateProfileSchema } = require('../schemas/user.schema');

const EMAIL_IN_USE_MESSAGE = 'El correo electrónico ya está registrado.';
const FORBIDDEN_MESSAGE = 'No tienes permiso para acceder a otra cuenta.';

function toProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    contactEmail: user.contactEmail ?? null,
    createdAt: user.createdAt ?? null,
  };
}

// Solo permite operar sobre la cuenta del usuario autenticado.
function ensureOwnAccount(req, res, next) {
  if (req.params.id !== req.auth.userId) {
    return res.status(403).json({ message: FORBIDDEN_MESSAGE });
  }

  return next();
}

async function getProfile(req, res) {
  return res.status(200).json({ user: toProfile(req.auth.user) });
}

async function updateProfile(req, res, next) {
  const result = updateProfileSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: 'Datos de perfil inválidos.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const changes = result.data;
  const { userId } = req.auth;

  try {
    if (changes.email !== undefined) {
      const emailTaken = await userRepository.isEmailTakenByOther(changes.email, userId);

      if (emailTaken) {
        return res.status(409).json({ message: EMAIL_IN_USE_MESSAGE });
      }
    }

    const user = await userRepository.updateProfile(userId, changes);

    if (!user) {
      return res.status(401).json({ message: 'Sesión no válida o expirada.' });
    }

    return res.status(200).json({
      message: 'Perfil actualizado correctamente.',
      user: toProfile(user),
    });
  } catch (error) {
    // 23505 = violación de índice único en PostgreSQL (correo repetido).
    if (error.code === '23505') {
      return res.status(409).json({ message: EMAIL_IN_USE_MESSAGE });
    }

    return next(error);
  }
}

module.exports = {
  ensureOwnAccount,
  getProfile,
  updateProfile,
  EMAIL_IN_USE_MESSAGE,
  FORBIDDEN_MESSAGE,
};
