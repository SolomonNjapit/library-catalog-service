# Library Catalog Service

REST API for a library platform: Mongoose schemas for books and genres, a seed script that fills a MongoDB Atlas database with sample data, and Express routes for managing genres and books with filtering, search, pagination and input validation.

## Setup

1. Install dependencies: `npm install`
2. Copy the example env file: `cp .env.example .env`
3. Put your Atlas connection string in `.env` as `MONGODB_URI`
4. Seed the database: `npm run seed`
5. Start the API: `npm run dev` (auto-restarts on changes) or `npm start`

The server listens on `http://localhost:3000` by default. Set `PORT` in `.env` to change it. Your IP address must be on the Atlas Network Access list or the server will fail to connect.

The seed script is idempotent. It deletes all existing `Book` and `Genre` documents, then inserts 5 genres and 20 books, so it can be re-run safely and always ends with the same data. It prints `Seeded 5 genres and 20 books` when done.

## API Endpoints

### Genres

| Method | Path | Description | Success | Errors |
| ------ | ---- | ----------- | ------- | ------ |
| GET | `/genres` | List all genres (sorted by name) | 200 | |
| GET | `/genres/:id` | Get one genre | 200 | 400 bad id, 404 not found |
| POST | `/genres` | Create a genre | 201 | 400 validation, 409 duplicate name/slug |
| PUT | `/genres/:id` | Update a genre (send both `name` and `slug`) | 200 | 400 validation, 404 not found, 409 duplicate |
| DELETE | `/genres/:id` | Delete a genre | 200 | 404 not found, 409 genre still has books |

Request body for POST and PUT:

```json
{ "name": "Science Fiction", "slug": "science-fiction" }
```

**Deleting a genre:** a genre that still has books cannot be deleted. The API returns `409 Conflict` with a message saying how many books still use it. I chose this over cascading the delete or leaving books pointing at a missing genre, because it prevents orphaned books and accidental data loss. To delete a genre, first reassign or delete its books.

### Books

| Method | Path | Description | Success | Errors |
| ------ | ---- | ----------- | ------- | ------ |
| GET | `/books` | List books with filtering, search and pagination | 200 | 400 bad query parameter |
| GET | `/books/:id` | Get one book (genre populated) | 200 | 400 bad id, 404 not found |
| POST | `/books` | Create a book | 201 | 400 validation, 409 duplicate ISBN |
| PUT | `/books/:id` | Update a book (send all required fields) | 200 | 400 validation, 404 not found, 409 duplicate ISBN |
| DELETE | `/books/:id` | Delete a book | 200 | 400 bad id, 404 not found |

Request body for POST and PUT:

```json
{
  "title": "A Cold Case in Karen",
  "author": "Wanjiru Kamau",
  "isbn": "9781000000108",
  "description": "A journalist reopens a decades-old disappearance.",
  "coverImage": "https://placehold.co/300x450",
  "totalCopies": 5,
  "availableCopies": 5,
  "genre": "<genre _id>"
}
```

Required: `title`, `author`, `isbn`, `totalCopies`, `availableCopies`, `genre`. Optional: `description`, `coverImage`.

### Query parameters for `GET /books`

All parameters are optional and can be combined in one request.

| Parameter | Description | Default / limits |
| --------- | ----------- | ---------------- |
| `genre` | Only books in this genre (a genre `_id`) | must be a valid ObjectId |
| `search` | Case-insensitive match against `title` OR `author` | text |
| `page` | Page number | default `1`, whole number of 1 or more |
| `limit` | Books per page | default `10`, whole number from 1 to 100 |

Example:

```
GET /books?genre=<genreId>&search=karen&page=1&limit=5
```

Response shape (the totals let a frontend build a pager):

```json
{
  "data": [ { "title": "...", "genre": { "_id": "...", "name": "Mystery", "slug": "mystery" } } ],
  "page": 1,
  "limit": 5,
  "totalCount": 1,
  "totalPages": 1
}
```

## Validation and Error Format

Create and update requests are checked by reusable middleware in `middleware/validate.js` before they reach the database. A global error handler in `middleware/errorHandler.js` makes sure every error is returned as JSON, never as a stack trace or a raw Mongoose/Mongo error.

Validation checks include: missing required fields, wrong types (for example a number where a string is required), `availableCopies` greater than `totalCopies`, a `genre` id that is malformed or does not exist, and malformed `:id` URL parameters.

Validation errors return `400` with a field-specific list:

```json
{
  "message": "Validation failed",
  "errors": [
    { "field": "title", "message": "title must be a non-empty string" },
    { "field": "genre", "message": "genre does not exist" }
  ]
}
```

| Status | Meaning |
| ------ | ------- |
| 200 | Success (read, update, delete) |
| 201 | Created |
| 400 | Invalid input, bad id, bad query parameter, or malformed JSON body |
| 404 | Resource or route not found |
| 409 | Conflict: duplicate unique value (ISBN, genre name or slug), or deleting a genre that still has books |
| 500 | Unexpected server error (`{ "message": "Internal server error" }`, details are only logged on the server) |

## Postman Collection

The collection is committed at `postman/library-catalog.postman_collection.json`. It has a request for every endpoint (17 in total), test scripts that check each status code, and saved example responses for the `400` validation errors.

To use it, import the file in Postman, start the API, and run the collection. Or run it from the command line:

```bash
npx newman run postman/library-catalog.postman_collection.json
```

The `baseUrl` variable defaults to `http://localhost:3000`.

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