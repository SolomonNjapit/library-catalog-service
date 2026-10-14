const express = require('express');
const Genre = require('../models/Genre');
const Book = require('../models/Book');
const { validateIdParam, validateGenre } = require('../middleware/validate');

const router = express.Router();

// GET /genres - list all
router.get('/', async (req, res) => {
  const genres = await Genre.find().sort({ name: 1 });
  res.status(200).json(genres);
});

// GET /genres/:id - get one
router.get('/:id', validateIdParam, async (req, res) => {
  const genre = await Genre.findById(req.params.id);
  if (!genre) {
    return res.status(404).json({ message: 'Genre not found' });
  }
  res.status(200).json(genre);
});

// POST /genres - create
router.post('/', validateGenre, async (req, res) => {
  const { name, slug } = req.body;
  const genre = await Genre.create({ name, slug });
  res.status(201).json(genre);
});

// PUT /genres/:id - update
router.put('/:id', validateIdParam, validateGenre, async (req, res) => {
  const { name, slug } = req.body;
  const genre = await Genre.findByIdAndUpdate(
    req.params.id,
    { name, slug },
    { new: true, runValidators: true }
  );
  if (!genre) {
    return res.status(404).json({ message: 'Genre not found' });
  }
  res.status(200).json(genre);
});

// DELETE /genres/:id - delete (blocked if books still use this genre)
router.delete('/:id', validateIdParam, async (req, res) => {
  const genre = await Genre.findById(req.params.id);
  if (!genre) {
    return res.status(404).json({ message: 'Genre not found' });
  }

  const bookCount = await Book.countDocuments({ genre: genre._id });
  if (bookCount > 0) {
    return res.status(409).json({
      message: `Cannot delete genre: ${bookCount} book(s) still use it. Reassign or delete those books first.`,
    });
  }

  await genre.deleteOne();
  res.status(200).json({ message: 'Genre deleted' });
});

module.exports = router;