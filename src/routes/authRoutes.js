const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Private route
router.get('/me', protect, getMe);

// Old ping (keep for sanity check)
router.get('/ping', (req, res) => {
  res.json({ message: 'Auth route is alive' });
});

module.exports = router;