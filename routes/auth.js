const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const cookieOptions = {
  httpOnly: true, // JavaScript cannot read this cookie (resists XSS)
  sameSite: 'strict', // not sent on cross-site requests (resists CSRF)
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  maxAge: 24 * 60 * 60 * 1000, // 1 day, matches JWT_EXPIRES_IN
};

const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

// POST /api/auth/register  (always creates a patron)
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Role is NEVER taken from the request body, so nobody can self-register as a librarian
    const user = await User.create({ username, email, password, role: 'patron' });

    res.status(201).json({ message: 'Account created', user });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `${field} already in use` });
    }
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      return res.status(400).json({ message: 'Validation failed', errors });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    const valid = user && (await user.comparePassword(password));
    if (!valid) {
      // Same message for both cases so attackers can't tell which emails exist
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.cookie('token', token, cookieOptions);
    res.json({ message: 'Logged in', user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout  (clears the cookie on the client)
router.post('/logout', (req, res) => {
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie('token', clearOptions);
  res.json({ message: 'Logged out' });
});

module.exports = router;