const express = require('express');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Library Catalog API is running' });
});

// Routes will be mounted here as we build them

// Unknown route -> JSON 404
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Must be last
app.use(errorHandler);

module.exports = app;