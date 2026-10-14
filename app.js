const express = require('express');
const errorHandler = require('./middleware/errorHandler');
const genreRoutes = require('./routes/genres');
const bookRoutes = require('./routes/books');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Library Catalog API is running' });
});

app.use('/genres', genreRoutes);
app.use('/books', bookRoutes);

// Unknown route -> JSON 404
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Must be last
app.use(errorHandler);

module.exports = app;