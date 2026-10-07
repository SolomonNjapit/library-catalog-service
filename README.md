# Library Catalog Service

Data layer for a library platform: Mongoose schemas for books and genres, plus a seed script that fills a MongoDB Atlas database with sample data.

## Setup

1. Install dependencies: `npm install`
2. Copy the example env file: `cp .env.example .env`
3. Put your Atlas connection string in `.env` as `MONGODB_URI`
4. Seed the database: `npm run seed`

The seed script is idempotent. It deletes all existing `Book` and `Genre` documents, then inserts 5 genres and 20 books, so it can be re-run safely and always ends with the same data. It prints `Seeded 5 genres and 20 books` when done.

## Schema Design

### Genre

- `name` and `slug` are plain strings on the `Genre` document. Both have unique indexes: `name` so two genres can't share a display name, and `slug` (always lowercase) so each genre has one URL-safe identifier like `science-fiction`.
- Genres live in their own collection because many books share one genre (see `genre` below).

### Book

**`title`, `author`: embedded strings.**
I considered a separate `Author` collection, but the catalog has no author-level features yet (no bios, no author pages), and every query for a book would then need a second lookup just to show a name. The cost is duplication: an author with several books has their name repeated, and spelling variants ("J.K. Rowling" vs "JK Rowling") would make searching by author inconsistent. I chose simplicity, and an `Author` reference can be added later if author pages are needed.

**`isbn`: embedded string with a unique index.**
It identifies one edition of a book, so it belongs on the book itself. It is a string, not a number, because ISBNs can have leading zeros and ISBN-10 can end in `X`. The unique index makes the database reject duplicates, not just the application code. The trade-off is a small extra cost on every write to maintain the index.

**`description`, `coverImage`: embedded strings.**
Both are only ever read together with their book, so a separate collection would add a lookup for no benefit. `coverImage` stores a URL, not the image itself: storing binary data in MongoDB would bloat every document and slow down every catalog read, and the 16 MB document limit makes it a bad fit. The trade-off is that a URL can break if the image host changes.

**`totalCopies`, `availableCopies`: embedded numbers.**
I considered a separate `Copy` collection with one document per physical copy. That would allow tracking each copy's condition and borrower, but every "is this available?" check would become a count query across many documents. Two counters on the book make availability a single-document read, and a checkout can be one atomic `$inc`. The trade-off is that counters can drift from reality and there is no per-copy history. A schema validator enforces `availableCopies <= totalCopies` when documents are created, which is how the seed stays consistent. Mongoose does not run that validator on update queries like `findOneAndUpdate`, so future checkout code must guard the update itself, for example by filtering on `availableCopies: { $gt: 0 }`.

**`genre`: reference (`ObjectId`, `ref: 'Genre'`).**
This is the one field I deliberately did not embed. A genre is shared by many books, so embedding its name and slug would copy them into every book document. Renaming a genre or fixing a typo would then mean updating many books, and inconsistent copies like "Sci-Fi" and "Science Fiction" could creep in. A reference stores the genre once, keeps the slug unique, and lets the app list genres on their own for a filter menu. The trade-off is read speed: showing a genre name next to a book needs `populate('genre')`, which is a second query. I accepted that because genres are few and small. Each book has exactly one genre, so this is a single reference and not an array. If books ever need several genres, it would change to an array of `ObjectId`s.
