// Global error handler: always responds with JSON, never a stack trace.
function errorHandler(err, req, res, next) {
  // Malformed JSON body (e.g. a missing quote or trailing comma)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      message: 'Invalid JSON in request body',
      errors: [{ field: 'body', message: 'Request body is not valid JSON' }],
    });
  }

  // Mongoose schema validation errors
  if (err.name === 'ValidationError' && err.errors) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  // Bad ObjectId or wrong type for a field
  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: [{ field: err.path, message: `Invalid value for ${err.path}` }],
    });
  }

  // Duplicate key (unique index), e.g. same ISBN or genre name twice
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      message: 'Duplicate value',
      errors: [{ field, message: `${field} already exists` }],
    });
  }

  // Anything else: log it on the server, hide details from the client
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
}

module.exports = errorHandler;