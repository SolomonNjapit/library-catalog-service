const express = require('express');
const mongoose = require('mongoose');
const Book = require('../models/Book');
const { validateIdParam, validateBook } = require('../middleware/validate');

const router = express.Router();

// Escape user text so characters like ( or * can't break the regex
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /books?genre=<id>&search=<text>&page=<n>&limit=<n>
router.get('/', async (req, res) => {
  const { genre, search } = req.query;
  const errors = [];

  // Validate query parameters
  if (genre !== undefined && !mongoose.isValidObjectId(genre)) {
    errors.push({ field: 'genre', message: 'genre must be a valid genre id' });
  }

  let page = 1;
  if (req.query.page !== undefined) {
    page = Number(req.query.page);
    if (!Number.isInteger(page) || page < 1) {
      errors.push({ field: 'page', message: 'page must be a whole number of 1 or more' });
    }
  }

  let limit = 10;
  if (req.query.limit !== undefined) {
    limit = Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push({ field: 'limit', message: 'limit must be a whole number between 1 and 100' });
    }
  }

  if (typeof search !== 'undefined' && typeof search !== 'string') {
    errors.push({ field: 'search', message: 'search must be text' });
  }

  if (errors.length) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  // Build the filter (all parts combine)
  const filter = {};
  if (genre) filter.genre = genre;
  if (search && search.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ title: regex }, { author: regex }];
  }

  const totalCount = await Book.countDocuments(filter);
  const totalPages = Math.ceil(totalCount / limit);

  const books = await Book.find(filter)
    .populate('genre', 'name slug')
    .sort({ title: 1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.status(200).json({ data: books, page, limit, totalCount, totalPages });
});

// GET /books/:id
router.get('/:id', validateIdParam, async (req, res) => {
  const book = await Book.findById(req.params.id).populate('genre', 'name slug');
  if (!book) {
    return res.status(404).json({ message: 'Book not found' });
  }
  res.status(200).json(book);
});

// POST /books
router.post('/', validateBook, async (req, res) => {
  const { title, author, isbn, description, coverImage, totalCopies, availableCopies, genre } =
    req.body;
  const book = await Book.create({
    title,
    author,
    isbn,
    description,
    coverImage,
    totalCopies,
    availableCopies,
    genre,
  });
  res.status(201).json(book);
});

// PUT /books/:id
router.put('/:id', validateIdParam, validateBook, async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) {
    return res.status(404).json({ message: 'Book not found' });
  }

  const fields = [
    'title',
    'author',
    'isbn',
    'description',
    'coverImage',
    'totalCopies',
    'availableCopies',
    'genre',
  ];
  for (const field of fields) {
    if (req.body[field] !== undefined) book[field] = req.body[field];
  }

  await book.save();
  res.status(200).json(book);
});

// DELETE /books/:id
router.delete('/:id', validateIdParam, async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) {
    return res.status(404).json({ message: 'Book not found' });
  }
  res.status(200).json({ message: 'Book deleted' });
});

module.exports = router;