import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import test from 'node:test';
import mysql from 'mysql2/promise';
import request from 'supertest';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDatabase = 'eventease_test';

if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
  throw new Error('Set DB_USER and DB_PASSWORD in eventease-backend/.env before running database integration tests.');
}

process.env.NODE_ENV = 'test';
process.env.DB_NAME = testDatabase;
process.env.JWT_SECRET ||= 'test-only-secret-with-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN ||= '1d';
process.env.CLIENT_ORIGIN ||= 'http://localhost:8000';
process.env.COOKIE_SECURE ||= 'false';

const databaseOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: testDatabase
};

const setupConnection = await mysql.createConnection({ ...databaseOptions, multipleStatements: true });
try {
  const schema = await readFile(path.join(backendRoot, 'sql', 'schema.sql'), 'utf8');
  const statements = schema.replace(/^\s*CREATE DATABASE IF NOT EXISTS eventease[^;]*;\s*USE eventease;\s*/i, '');
  assert.notEqual(statements, schema, 'The dev database selection must be removed before test schema setup.');
  await setupConnection.query(statements);
} finally {
  await setupConnection.end();
}

execFileSync(process.execPath, ['scripts/seed.js'], {
  cwd: backendRoot,
  env: { ...process.env, DB_NAME: testDatabase },
  stdio: 'ignore'
});

const { app } = await import('../src/app.js');
const { pool } = await import('../src/config/db.js');

test('MySQL integration: auth, role access, booking concurrency, cancellation, and ownership', async (t) => {
  const tag = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const testEmails = Array.from({ length: 6 }, (_, index) => `integration-${tag}-${index}@example.test`);
  const eventIds = [];
  const bookingIds = [];
  const connection = await pool.getConnection();
  const admin = request.agent(app);
  const organizer = request.agent(app);
  const users = testEmails.map(() => request.agent(app));
  let organizerId;
  let adminId;

  try {
    const [[adminRow]] = await connection.execute('SELECT id FROM users WHERE email = ?', ['admin@eventease.com']);
    const [[organizerRow]] = await connection.execute('SELECT id FROM users WHERE email = ?', ['organizer@eventease.com']);
    assert.ok(adminRow && organizerRow, 'test seed should create admin and organizer accounts');
    adminId = Number(adminRow.id);
    organizerId = Number(organizerRow.id);

    await t.test('demo auth and registration', async () => {
      const testPassword = randomBytes(24).toString('base64url');
      const testPasswordHash = await bcrypt.hash(testPassword, 12);
      await connection.execute('UPDATE users SET password_hash = ? WHERE id IN (?, ?)', [testPasswordHash, adminId, organizerId]);
      const adminLogin = await admin.post('/api/v1/auth/login').send({ email: 'admin@eventease.com', password: testPassword });
      assert.equal(adminLogin.status, 200);
      assert.equal(adminLogin.body.data.user.role, 'admin');

      const organizerLogin = await organizer.post('/api/v1/auth/login').send({ email: 'organizer@eventease.com', password: testPassword });
      assert.equal(organizerLogin.status, 200);
      assert.equal(organizerLogin.body.data.user.role, 'organizer');
      assert.equal((await organizer.get('/api/v1/organizer/dashboard')).status, 200);
      const adminExport = await admin.get('/api/v1/admin/bookings/export');
      assert.equal(adminExport.status, 200);
      assert.match(adminExport.headers['content-type'], /text\/csv/);

      for (let index = 0; index < users.length; index += 1) {
        const registered = await users[index].post('/api/v1/auth/register').send({
          name: `Integration User ${index}`,
          email: testEmails[index],
          password: 'IntegrationTest!2026'
        });
        assert.equal(registered.status, 201);
        assert.equal(registered.body.data.user.role, 'user');
      }

      const me = await users[0].get('/api/v1/auth/me');
      assert.equal(me.status, 200);
      assert.equal(me.body.data.user.email, testEmails[0]);
      assert.equal((await users[0].get('/api/v1/admin/dashboard')).status, 403);
    });

    const [[category]] = await connection.execute('SELECT id FROM categories WHERE category_name = ?', ['Tech']);
    assert.ok(category, 'test seed should create the Tech category');
    const createEvent = async (title, hoursUntil, capacity) => {
      const response = await organizer.post('/api/v1/organizer/events').send({
        title: `${title} ${tag}`,
        description: 'A dedicated integration test event for validating authenticated event and booking behavior.',
        categoryId: Number(category.id),
        eventDate: new Date(Date.now() + hoursUntil * 60 * 60 * 1000).toISOString().slice(0, 19),
        venue: 'Integration Test Venue',
        city: 'Bengaluru',
        bannerImage: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=900&q=80',
        ticketPrice: 250,
        capacity
      });
      assert.equal(response.status, 201, response.body.message);
      assert.equal(response.body.data.event.status, 'Pending');
      const eventId = Number(response.body.data.event.id);
      eventIds.push(eventId);
      return eventId;
    };
    const approveEvent = async (eventId) => {
      const response = await admin.patch(`/api/v1/admin/events/${eventId}/approve`);
      assert.equal(response.status, 200, response.body.message);
      assert.equal(response.body.data.status, 'Approved');
    };

    const capacityEventId = await createEvent('Concurrency Event', 96, 4);
    await approveEvent(capacityEventId);
    const publicEvent = await request(app).get(`/api/v1/events/${capacityEventId}`);
    assert.equal(publicEvent.status, 200);
    assert.equal(publicEvent.body.data.event.available_seats, 4);
    const eventBookings = await organizer.get(`/api/v1/organizer/events/${capacityEventId}/bookings`);
    assert.equal(eventBookings.status, 200);
    assert.deepEqual(eventBookings.body.data.items, []);
    const eventExport = await organizer.get(`/api/v1/organizer/events/${capacityEventId}/bookings/export`);
    assert.equal(eventExport.status, 200);
    assert.match(eventExport.headers['content-type'], /text\/csv/);

    await t.test('concurrent booking never oversells and cancellation restores seats', async () => {
      const attempts = await Promise.all(users.slice(0, 5).map((agent) =>
        agent.post('/api/v1/bookings').send({ eventId: capacityEventId, quantity: 1 })
      ));
      const successful = attempts.filter((response) => response.status === 201);
      const rejected = attempts.filter((response) => response.status === 409);
      assert.equal(successful.length, 4);
      assert.equal(rejected.length, 1);
      for (const response of successful) bookingIds.push(Number(response.body.data.booking.id));

      const ticketOwner = attempts.indexOf(successful[0]);
      const ticketList = await users[ticketOwner].get('/api/v1/tickets');
      assert.equal(ticketList.status, 200);
      const ticket = ticketList.body.data.items.find((item) => item.booking_id === bookingIds[0]);
      assert.ok(ticket, 'confirmed upcoming booking should have a ticket');
      assert.match(ticket.qr_code_data_url, /^data:image\/png;base64,/);
      assert.deepEqual(JSON.parse(ticket.qr_payload), {
        ticketId: ticket.ticket_id,
        bookingId: Number(ticket.booking_id)
      });

      const [[inventory]] = await connection.execute(
        'SELECT available_seats FROM events WHERE id = ?',
        [capacityEventId]
      );
      assert.equal(Number(inventory.available_seats), 0);

      for (const response of successful) {
        const bookingId = Number(response.body.data.booking.id);
        const owner = attempts.indexOf(response);
        const cancelled = await users[owner].post(`/api/v1/bookings/${bookingId}/cancel`).send({});
        assert.equal(cancelled.status, 200, cancelled.body.message);
        assert.equal(cancelled.body.data.booking_status, 'Cancelled');
      }

      const [[restored]] = await connection.execute(
        'SELECT available_seats FROM events WHERE id = ?',
        [capacityEventId]
      );
      assert.equal(Number(restored.available_seats), 4);

      const cancelledTickets = await users[ticketOwner].get('/api/v1/tickets');
      assert.equal(cancelledTickets.status, 200);
      assert.equal(cancelledTickets.body.data.items.some((item) => bookingIds.includes(Number(item.booking_id))), false);
    });

    const nearEventId = await createEvent('Cancellation Window Event', 12, 1);
    await approveEvent(nearEventId);
    const nearBooking = await users[0].post('/api/v1/bookings').send({ eventId: nearEventId, quantity: 1 });
    assert.equal(nearBooking.status, 201, nearBooking.body.message);
    bookingIds.push(Number(nearBooking.body.data.booking.id));
    const tooLateCancellation = await users[0].post(`/api/v1/bookings/${nearBooking.body.data.booking.id}/cancel`).send({});
    assert.equal(tooLateCancellation.status, 409);

    await t.test('blocked users cannot log in', async () => {
      const registered = await users[5].get('/api/v1/auth/me');
      assert.equal(registered.status, 200);
      const userId = Number(registered.body.data.user.id);
      const blocked = await admin.patch(`/api/v1/admin/users/${userId}/status`).send({ status: 'Blocked' });
      assert.equal(blocked.status, 200, blocked.body.message);
      const login = await request(app).post('/api/v1/auth/login').send({ email: testEmails[5], password: 'IntegrationTest!2026' });
      assert.equal(login.status, 403);
    });

    await t.test('organizer cannot access another organizer event', async () => {
      const me = await users[4].get('/api/v1/auth/me');
      assert.equal(me.status, 200);
      const userId = Number(me.body.data.user.id);
      const promoted = await admin.patch(`/api/v1/admin/users/${userId}/role`).send({ role: 'organizer' });
      assert.equal(promoted.status, 200, promoted.body.message);
      const secondOrganizer = users[4];
      await secondOrganizer.post('/api/v1/auth/logout');
      const login = await secondOrganizer.post('/api/v1/auth/login').send({ email: testEmails[4], password: 'IntegrationTest!2026' });
      assert.equal(login.status, 200);
      const denied = await secondOrganizer.get(`/api/v1/organizer/events/${capacityEventId}`);
      assert.equal(denied.status, 404);
    });
  } finally {
    try {
      await connection.beginTransaction();
      const testUserIds = [];
      for (const email of testEmails) {
        const [rows] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (rows[0]) testUserIds.push(Number(rows[0].id));
      }
      if (testUserIds.length) {
        const placeholders = testUserIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, testUserIds);
        await connection.execute(`DELETE FROM organizer_requests WHERE user_id IN (${placeholders})`, testUserIds);
        for (const userId of testUserIds) {
          await connection.execute('DELETE FROM activity_log WHERE description LIKE ?', [`%user ${userId} %`]);
        }
      }
      if (eventIds.length) {
        const placeholders = eventIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM notifications WHERE message LIKE ?`, [`%${tag}%`]);
        await connection.execute(`DELETE FROM activity_log WHERE description LIKE ?`, [`%${tag}%`]);
        await connection.execute(`DELETE FROM bookings WHERE event_id IN (${placeholders})`, eventIds);
        await connection.execute(`DELETE FROM events WHERE id IN (${placeholders})`, eventIds);
      }
      if (testUserIds.length) {
        const placeholders = testUserIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM users WHERE id IN (${placeholders})`, testUserIds);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    await pool.end();
  }
});
