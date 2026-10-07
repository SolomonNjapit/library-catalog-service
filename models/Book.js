const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    author: {
      type: String,
      required: [true, 'Author is required'],
      trim: true,
    },
    isbn: {
      type: String,
      required: [true, 'ISBN is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    coverImage: {
      type: String,
      trim: true,
    },
    totalCopies: {
      type: Number,
      required: [true, 'Total copies is required'],
      min: [0, 'Total copies cannot be negative'],
    },
    availableCopies: {
      type: Number,
      required: [true, 'Available copies is required'],
      min: [0, 'Available copies cannot be negative'],
      validate: {
        validator: function (value) {
          return value <= this.totalCopies;
        },
        message: 'Available copies cannot exceed total copies',
      },
    },
    genre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Genre',
      required: [true, 'Genre is required'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Book', bookSchema);
