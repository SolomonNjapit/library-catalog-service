require('dotenv').config();
const mongoose = require('mongoose');
const Genre = require('./models/Genre');
const Book = require('./models/Book');

// Builds a well-formed ISBN-13 (978 prefix + 9 digits + valid check digit)
function makeIsbn13(n) {
  const base = '978' + String(100000000 + n);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const genreNames = [
  'Science Fiction',
  'Fantasy',
  'Mystery',
  'History',
  'Romance',
];

// [title, author, description, totalCopies, availableCopies, genre name]
const bookData = [
  ['The Last Orbit', 'Mara Voss', 'A failing space station crew races to save the last human colony.', 5, 3, 'Science Fiction'],
  ['Signal from Kepler', 'Daniel Okoye', 'A mysterious radio signal changes humanity\'s view of the universe.', 4, 4, 'Science Fiction'],
  ['Glass Cities of Mars', 'Elena Ruiz', 'Engineers build the first domed cities on Mars and face a hidden threat.', 6, 2, 'Science Fiction'],
  ['The Quiet Machine', 'Tobias Lindqvist', 'An AI caretaker begins to question the orders it was built to follow.', 3, 0, 'Science Fiction'],
  ['The Ember Crown', 'Aria Whitlock', 'A young blacksmith discovers she is heir to a lost fire kingdom.', 5, 5, 'Fantasy'],
  ['Songs of the Hollow Moon', 'Kofi Mensah', 'A wandering singer uncovers the magic hidden inside old village songs.', 4, 1, 'Fantasy'],
  ['The Cartographer\'s Dragon', 'Lena Haas', 'A mapmaker and a talking dragon search for a continent that keeps moving.', 3, 3, 'Fantasy'],
  ['Thornwood Road', 'Rowan Pike', 'Three travelers cross a cursed forest where the path rewrites itself.', 6, 4, 'Fantasy'],
  ['The Lantern Street Murders', 'Harriet Doyle', 'A retired detective investigates a string of crimes in a foggy harbor town.', 4, 2, 'Mystery'],
  ['A Cold Case in Karen', 'Wanjiru Kamau', 'A journalist reopens a decades-old disappearance in a Nairobi suburb.', 5, 5, 'Mystery'],
  ['Nine Keys to Nowhere', 'Samuel Adeyemi', 'A locksmith is pulled into a puzzle that connects nine unrelated deaths.', 3, 1, 'Mystery'],
  ['The Missing Archivist', 'Clara Bennett', 'When a city archivist vanishes, her last catalogued file points to a conspiracy.', 4, 4, 'Mystery'],
  ['Empires of the Indian Ocean', 'Amina Salim', 'A sweeping look at the trade routes and powers that shaped the region.', 5, 3, 'History'],
  ['The Swahili Coast Traders', 'Joseph Ouma', 'How merchant towns linked East Africa to Arabia, India, and China.', 4, 4, 'History'],
  ['Rails Across the Rift', 'Peter Mwangi', 'The story of building a railway through some of Africa\'s toughest terrain.', 6, 5, 'History'],
  ['Kingdoms of the Great Lakes', 'Isaac Kiprono', 'An overview of the states and cultures around the Great Lakes before colonial rule.', 3, 2, 'History'],
  ['Monsoon Letters', 'Priya Nair', 'Two pen pals on opposite coasts slowly fall in love through handwritten letters.', 5, 5, 'Romance'],
  ['The Cafe on Tom Mboya Street', 'Lydia Achieng', 'A café owner and a visiting chef clash over the same tiny kitchen.', 4, 0, 'Romance'],
  ['Summer in Lamu', 'Zara Hassan', 'A holiday on the island turns into a second chance at an old love.', 4, 3, 'Romance'],
  ['Second Chances at Sunrise', 'Naomi Carter', 'Two former rivals reunite to save their hometown bakery.', 3, 3, 'Romance'],
];

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Create a .env file (see .env.example).');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing data so the script is safe to re-run
  await Book.deleteMany({});
  await Genre.deleteMany({});

  // Insert genres
  const genres = await Genre.insertMany(
    genreNames.map((name) => ({ name, slug: slugify(name) }))
  );

  const genreIdByName = {};
  genres.forEach((g) => {
    genreIdByName[g.name] = g._id;
  });

  // Build books, referencing genres by ObjectId
  const books = bookData.map(
    ([title, author, description, totalCopies, availableCopies, genreName], i) => {
      if (availableCopies > totalCopies) {
        throw new Error(`Bad seed data: "${title}" has more available than total copies`);
      }
      return {
        title,
        author,
        isbn: makeIsbn13(i + 1),
        description,
        coverImage: `https://placehold.co/300x450?text=${encodeURIComponent(title)}`,
        totalCopies,
        availableCopies,
        genre: genreIdByName[genreName],
      };
    }
  );

  await Book.insertMany(books);

  console.log(`Seeded ${genres.length} genres and ${books.length} books`);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  });
