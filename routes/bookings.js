const express = require('express');
const Booking = require('../models/Booking');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

router.post('/', requireAuth, async (req, res, next) => {
  const { space, date, startTime, endTime } = req.body || {};
  if (!space || !date || !startTime || !endTime) {
    return res.status(400).json({ message: 'space, date, startTime, and endTime are required' });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ message: 'date must be a real date in YYYY-MM-DD format' });
  }
  if (
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
    endTime <= startTime
  ) {
    return res.status(400).json({ message: 'endTime must be a valid time later than startTime' });
  }

  try {
    const overlap = await Booking.findOne({
      space,
      date,
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    }).select('_id startTime endTime');
    if (overlap) {
      return res.status(409).json({
        message: `That time overlaps an existing ${space} booking (${overlap.startTime}–${overlap.endTime})`,
      });
    }

    const booking = await Booking.create({
      space,
      date,
      startTime,
      endTime,
      user: req.user._id,
    });
    await booking.populate('user', 'username email');
    return res.status(201).json({ data: booking });
  } catch (error) {
    return next(error);
  }
});

router.get('/', requireAuth, requireRole('librarian'), async (req, res, next) => {
  try {
    const data = await Booking.find()
      .populate('user', 'username email')
      .sort({ date: 1, startTime: 1 });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
