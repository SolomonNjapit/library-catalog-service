const mongoose = require('mongoose');
const Genre = require('../models/Genre');

// Sends a 400 with a field-specific list of problems
function fail(res, errors) {
  return res.status(400).json({ message: 'Validation failed', errors });
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonNegativeInt = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

// Checks that :id in the URL is a valid ObjectId
function validateIdParam(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(res, [{ field: 'id', message: 'id must be a valid ObjectId' }]);
  }
  next();
}

// Genre create & update (PUT replaces the whole genre, so both fields are required)
function validateGenre(req, res, next) {
  const body = req.body || {};
  const errors = [];

  if (body.name === undefined) {
    errors.push({ field: 'name', message: 'name is required' });
  } else if (!isNonEmptyString(body.name)) {
    errors.push({ field: 'name', message: 'name must be a non-empty string' });
  }

  if (body.slug === undefined) {
    errors.push({ field: 'slug', message: 'slug is required' });
  } else if (!isNonEmptyString(body.slug)) {
    errors.push({ field: 'slug', message: 'slug must be a non-empty string' });
  }

  if (errors.length) return fail(res, errors);
  next();
}

// Book create & update (PUT replaces the whole book, so required fields stay required)
async function validateBook(req, res, next) {
  const body = req.body || {};
  const errors = [];

  // Required strings
  for (const field of ['title', 'author', 'isbn']) {
    if (body[field] === undefined) {
      errors.push({ field, message: `${field} is required` });
    } else if (!isNonEmptyString(body[field])) {
      errors.push({ field, message: `${field} must be a non-empty string` });
    }
  }

  // Optional strings
  for (const field of ['description', 'coverImage']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      errors.push({ field, message: `${field} must be a string` });
    }
  }

  // Required numbers
  for (const field of ['totalCopies', 'availableCopies']) {
    if (body[field] === undefined) {
      errors.push({ field, message: `${field} is required` });
    } else if (!isNonNegativeInt(body[field])) {
      errors.push({ field, message: `${field} must be a whole number of 0 or more` });
    }
  }

  // Cross-field rule (only when both are valid numbers)
  if (
    isNonNegativeInt(body.totalCopies) &&
    isNonNegativeInt(body.availableCopies) &&
    body.availableCopies > body.totalCopies
  ) {
    errors.push({
      field: 'availableCopies',
      message: 'availableCopies cannot exceed totalCopies',
    });
  }

  // Genre: required, valid id format, and must exist in the database
  if (body.genre === undefined) {
    errors.push({ field: 'genre', message: 'genre is required' });
  } else if (!mongoose.isValidObjectId(body.genre)) {
    errors.push({ field: 'genre', message: 'genre must be a valid genre id' });
  } else {
    const exists = await Genre.exists({ _id: body.genre });
    if (!exists) {
      errors.push({ field: 'genre', message: 'genre does not exist' });
    }
  }

  if (errors.length) return fail(res, errors);
  next();
}

module.exports = { validateIdParam, validateGenre, validateBook };