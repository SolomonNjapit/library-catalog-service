const express = require('express');
const mongoose = require('mongoose');
const BorrowRequest = require('../models/BorrowRequest');
const Book = require('../models/Book');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateIdParam } = require('../middleware/validate');

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const FINE_PER_DAY = 0.25;
const statuses = ['pending', 'approved', 'returned', 'late'];

function getLateFine(dueAt, returnedAt) {
  const lateDays = Math.max(0, Math.ceil((returnedAt.getTime() - dueAt.getTime()) / DAY_MS));
  return Math.round(lateDays * FINE_PER_DAY * 100) / 100;
}

router.post('/', requireAuth, async (req, res, next) => {
  const { bookId } = req.body || {};
  if (typeof bookId !== 'string' || !mongoose.isValidObjectId(bookId)) {
    return res.status(400).json({ message: 'bookId must be a valid ObjectId' });
  }

  try {
    const bookExists = await Book.exists({ _id: bookId });
    if (!bookExists) return res.status(404).json({ message: 'Book not found' });

    const activeKey = `${req.user._id}:${bookId}`;
    const duplicate = await BorrowRequest.findOne({ activeKey }).select('_id');
    if (duplicate) {
      return res.status(409).json({ message: 'You already have an active request for this book' });
    }

    const book = await Book.findOneAndUpdate(
      { _id: bookId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { returnDocument: 'after' },
    );
    if (!book) {
      return res.status(409).json({ message: 'This book has no available copies' });
    }

    try {
      const request = await BorrowRequest.create({
        book: bookId,
        user: req.user._id,
        activeKey,
      });
      await request.populate('book', 'title author isbn coverImage availableCopies');
      return res.status(201).json({ data: request });
    } catch (error) {
      await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
      if (error.code === 11000) {
        return res.status(409).json({ message: 'You already have an active request for this book' });
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const data = await BorrowRequest.find({ user: req.user._id })
      .populate('book', 'title author isbn coverImage')
      .sort({ requestedAt: -1 });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.get('/', requireAuth, requireRole('librarian'), async (req, res, next) => {
  try {
    const data = await BorrowRequest.find()
      .populate('book', 'title author isbn coverImage')
      .populate('user', 'username email')
      .sort({ requestedAt: -1 });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/:id',
  requireAuth,
  requireRole('librarian'),
  validateIdParam,
  async (req, res, next) => {
    const { status, dueAt } = req.body || {};
    if (status !== undefined && !statuses.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${statuses.join(', ')}` });
    }

    let normalizedDueAt;
    if (dueAt !== undefined) {
      if (typeof dueAt !== 'string' || !dueAt.trim()) {
        return res.status(400).json({ message: 'dueAt must be a valid date' });
      }
      normalizedDueAt = new Date(dueAt);
      if (Number.isNaN(normalizedDueAt.getTime())) {
        return res.status(400).json({ message: 'dueAt must be a valid date' });
      }
    }
    if (status === undefined && dueAt === undefined) {
      return res.status(400).json({ message: 'Provide a status or dueAt to update' });
    }

    try {
      const current = await BorrowRequest.findById(req.params.id).select('+activeKey');
      if (!current) return res.status(404).json({ message: 'Borrow request not found' });
      if (current.status === 'returned' && status !== undefined) {
        return res.status(409).json({ message: 'A returned request cannot be changed again' });
      }

      const updates = {};
      if (normalizedDueAt) updates.dueAt = normalizedDueAt;

      if (status === 'returned') {
        const returnedAt = new Date();
        const dueDate = normalizedDueAt || current.dueAt;
        const bookUpdated = await Book.updateOne(
          { _id: current.book, $expr: { $lt: ['$availableCopies', '$totalCopies'] } },
          { $inc: { availableCopies: 1 } },
        );
        if (bookUpdated.modifiedCount !== 1) {
          return res.status(409).json({ message: 'Book inventory cannot be incremented for this return' });
        }

        let updated;
        try {
          updated = await BorrowRequest.findOneAndUpdate(
            { _id: current._id, status: { $ne: 'returned' } },
            {
              $set: {
                ...updates,
                status: 'returned',
                returnedAt,
                fine: getLateFine(dueDate, returnedAt),
              },
              $unset: { activeKey: 1 },
            },
            { returnDocument: 'after', runValidators: true },
          )
            .populate('book', 'title author isbn coverImage availableCopies')
            .populate('user', 'username email');
        } catch (error) {
          await Book.updateOne({ _id: current.book }, { $inc: { availableCopies: -1 } });
          throw error;
        }
        if (!updated) {
          await Book.updateOne({ _id: current.book }, { $inc: { availableCopies: -1 } });
          return res.status(409).json({ message: 'This borrow request has already been returned' });
        }
        return res.json({ data: updated });
      }

      if (status !== undefined) updates.status = status;
      const updated = await BorrowRequest.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
        .populate('book', 'title author isbn coverImage availableCopies')
        .populate('user', 'username email');
      return res.json({ data: updated });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
