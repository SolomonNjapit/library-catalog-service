require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

// Test account for grading. This password is also documented in the README.
const LIBRARIAN = {
  username: 'librarian',
  email: 'librarian@library.test',
  password: 'Librarian@2026',
  role: 'librarian',
};

async function seedLibrarian() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Idempotent: remove any existing librarian first, so there is always exactly one
    await User.deleteMany({
      $or: [{ role: 'librarian' }, { email: LIBRARIAN.email }],
    });

    // create() runs the pre-save hook, so the password is hashed with bcrypt
    await User.create(LIBRARIAN);
    console.log(`Seeded 1 librarian: ${LIBRARIAN.email}`);
  } catch (err) {
    console.error('Seeding librarian failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seedLibrarian();