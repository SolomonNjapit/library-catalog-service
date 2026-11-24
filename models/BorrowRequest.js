const mongoose = require('mongoose');

const borrowRequestSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'returned', 'late'],
      default: 'pending',
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    dueAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      required: true,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    fine: {
      type: Number,
      min: 0,
      default: 0,
      required: true,
    },
    activeKey: {
      type: String,
      default: undefined,
      select: false,
    },
  },
  { timestamps: true },
);

borrowRequestSchema.index({ activeKey: 1 }, { unique: true, sparse: true });
borrowRequestSchema.index({ user: 1, requestedAt: -1 });
borrowRequestSchema.index({ status: 1, dueAt: 1 });

module.exports = mongoose.model('BorrowRequest', borrowRequestSchema);
