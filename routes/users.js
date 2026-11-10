const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/profile
// Identity comes ONLY from the verified token (req.user), never from the query string or body
router.get('/profile', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;