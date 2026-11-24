const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    space: {
      type: String,
      required: [true, 'Space is required'],
      trim: true,
      enum: ['Reading Room', 'Quiet Study', 'Community Table'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Start time must use HH:MM format'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'End time must use HH:MM format'],
    },
  },
  { timestamps: true },
);

bookingSchema.index({ space: 1, date: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ user: 1, date: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
