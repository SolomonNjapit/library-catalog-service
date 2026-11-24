const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const mongoUri = process.env.MONGODB_TEST_URI;

test(
  'borrow inventory, librarian fines, and booking overlap rules',
  { skip: !mongoUri && 'Set MONGODB_TEST_URI to an isolated local test database.' },
  async () => {
    const parsedUri = new URL(mongoUri);
    if (!['localhost', '127.0.0.1', '::1'].includes(parsedUri.hostname)) {
      throw new Error('MONGODB_TEST_URI must point to a local MongoDB instance.');
    }
    if (!parsedUri.pathname.toLowerCase().includes('test')) {
      throw new Error('MONGODB_TEST_URI database name must include "test".');
    }

    process.env.JWT_SECRET = 'test-only-secret';
    const mongoose = require('mongoose');
    const User = require('../models/User');
    const Book = require('../models/Book');
    const Genre = require('../models/Genre');
    const BorrowRequest = require('../models/BorrowRequest');
    const Booking = require('../models/Booking');
    const app = require('../app');
    let server;

    try {
      await mongoose.connect(mongoUri);
      await mongoose.connection.dropDatabase();
      await Promise.all([BorrowRequest.init(), Booking.init()]);

      const [patron, librarian, genre] = await Promise.all([
        User.create({ username: 'test-patron', email: 'patron@example.test', password: 'passphrase-123' }),
        User.create({ username: 'test-librarian', email: 'librarian@example.test', password: 'passphrase-456', role: 'librarian' }),
        Genre.create({ name: 'Test Fiction', slug: 'test-fiction' }),
      ]);
      const book = await Book.create({
        title: 'Test Book',
        author: 'Test Author',
        isbn: '9780000000001',
        totalCopies: 2,
        availableCopies: 2,
        genre: genre._id,
      });

      const patronCookie = `token=${jwt.sign({ id: patron._id }, process.env.JWT_SECRET)}`;
      const librarianCookie = `token=${jwt.sign({ id: librarian._id }, process.env.JWT_SECRET)}`;
      server = app.listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;

      async function send(path, { method = 'GET', body, cookie } = {}) {
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (cookie) headers.Cookie = cookie;
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const payload = await response.json();
        return { status: response.status, payload };
      }

      const noAuth = await send('/api/borrow-requests', {
        method: 'POST',
        body: { bookId: String(book._id) },
      });
      assert.equal(noAuth.status, 401);

      const created = await send('/api/borrow-requests', {
        method: 'POST',
        cookie: patronCookie,
        body: { bookId: String(book._id) },
      });
      assert.equal(created.status, 201);
      const requestId = created.payload.data._id;
      assert.equal((await Book.findById(book._id)).availableCopies, 1);

      const duplicate = await send('/api/borrow-requests', {
        method: 'POST',
        cookie: patronCookie,
        body: { bookId: String(book._id) },
      });
      assert.equal(duplicate.status, 409);
      assert.equal((await Book.findById(book._id)).availableCopies, 1);

      const unauthorizedPatch = await send(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        body: { status: 'approved' },
      });
      assert.equal(unauthorizedPatch.status, 401);
      const patronPatch = await send(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        cookie: patronCookie,
        body: { status: 'approved' },
      });
      assert.equal(patronPatch.status, 403);

      const approved = await send(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        cookie: librarianCookie,
        body: { status: 'approved' },
      });
      assert.equal(approved.status, 200);

      const dueAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000).toISOString();
      const setDueDate = await send(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        cookie: librarianCookie,
        body: { dueAt },
      });
      assert.equal(setDueDate.status, 200);

      const returned = await send(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        cookie: librarianCookie,
        body: { status: 'returned', fine: 0 },
      });
      assert.equal(returned.status, 200);
      assert.equal(returned.payload.data.fine, 1);
      assert.equal(returned.payload.data.status, 'returned');
      assert.equal((await Book.findById(book._id)).availableCopies, 2);

      const secondReturn = await send(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        cookie: librarianCookie,
        body: { status: 'returned' },
      });
      assert.equal(secondReturn.status, 409);
      assert.equal((await Book.findById(book._id)).availableCopies, 2);

      const zeroCopyBook = await Book.create({
        title: 'Unavailable Book',
        author: 'Test Author',
        isbn: '9780000000002',
        totalCopies: 1,
        availableCopies: 0,
        genre: genre._id,
      });
      const unavailableRequest = await send('/api/borrow-requests', {
        method: 'POST',
        cookie: patronCookie,
        body: { bookId: String(zeroCopyBook._id) },
      });
      assert.equal(unavailableRequest.status, 409);

      const initialBooking = await send('/api/bookings', {
        method: 'POST',
        cookie: patronCookie,
        body: {
          space: 'Reading Room',
          date: '2030-07-14',
          startTime: '10:00',
          endTime: '12:00',
        },
      });
      assert.equal(initialBooking.status, 201);

      const overlappingRanges = [
        ['09:00', '10:30'],
        ['11:30', '12:30'],
        ['10:30', '11:00'],
        ['10:00', '12:00'],
      ];
      for (const [startTime, endTime] of overlappingRanges) {
        const overlap = await send('/api/bookings', {
          method: 'POST',
          cookie: patronCookie,
          body: { space: 'Reading Room', date: '2030-07-14', startTime, endTime },
        });
        assert.equal(overlap.status, 409, `${startTime}-${endTime} should overlap`);
      }

      const touchingRange = await send('/api/bookings', {
        method: 'POST',
        cookie: patronCookie,
        body: {
          space: 'Reading Room',
          date: '2030-07-14',
          startTime: '12:00',
          endTime: '13:00',
        },
      });
      assert.equal(touchingRange.status, 201);

      const bookingListUnauthorized = await send('/api/bookings', { cookie: patronCookie });
      assert.equal(bookingListUnauthorized.status, 403);
      const bookingList = await send('/api/bookings', { cookie: librarianCookie });
      assert.equal(bookingList.status, 200);
      assert.equal(bookingList.payload.data.length, 2);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (mongoose.connection.readyState) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      }
    }
  },
);
