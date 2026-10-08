const { Router } = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  ensureOwnAccount,
  getProfile,
  updateProfile,
} = require('../controllers/user.controller');

const router = Router();

router.use(requireAuth);

router.get('/me', getProfile);
router.patch('/me', updateProfile);

router.get('/:id', ensureOwnAccount, getProfile);
router.patch('/:id', ensureOwnAccount, updateProfile);

module.exports = router;
