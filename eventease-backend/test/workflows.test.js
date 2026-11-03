import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import test from 'node:test';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDatabase = 'eventease_test';

if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
  throw new Error('Set DB_USER and DB_PASSWORD in eventease-backend/.env before running workflow tests.');
}

process.env.NODE_ENV = 'test';
process.env.DB_NAME = testDatabase;
process.env.JWT_SECRET ||= 'test-only-secret-with-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN ||= '1d';
process.env.CLIENT_ORIGIN ||= 'http://localhost:8000';
process.env.COOKIE_SECURE ||= 'false';

const [{ app }, { pool }, { setUserStatus }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/db.js'),
  import('../src/services/adminService.js')
]);

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

class CookieJar {
  cookies = new Map();

  async fetch(url, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(url, { ...options, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, headers: response.headers, body };
  }

  async json(url, method = 'GET', body) {
    return this.fetch(url, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }
}

test('Organizer and admin workflows: HTTP behavior and database state', async (t) => {
  const tag = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const password = 'WorkflowTest!2026';
  const emails = {
    admin: `workflow-admin-${tag}@example.test`,
    organizer: `workflow-organizer-${tag}@example.test`,
    otherOrganizer: `workflow-other-organizer-${tag}@example.test`,
    attendee: `workflow-attendee-${tag}@example.test`,
    attendeeTwo: `workflow-attendee-two-${tag}@example.test`,
    blocked: `workflow-blocked-${tag}@example.test`,
    bookingUser: `workflow-booking-user-${tag}@example.test`,
    requestUser: `workflow-request-user-${tag}@example.test`
  };
  const fixtures = { userIds: [], eventIds: [], categoryIds: [], requestIds: [] };
  const activityTypes = [];
  const connection = await pool.getConnection();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const admin = new CookieJar();
  const organizer = new CookieJar();
  const otherOrganizer = new CookieJar();
  const attendee = new CookieJar();
  const attendeeTwo = new CookieJar();
  const blockedUser = new CookieJar();
  const bookingUser = new CookieJar();
  const requestUser = new CookieJar();
  let adminId;
  let organizerId;
  let otherOrganizerId;
  let attendeeId;
  let attendeeTwoId;
  let blockedId;
  let bookingUserId;
  let requestUserId;
  let categoryId;
  let seedAdminStatuses = [];

  const createFixtureUser = async (name, email, role = 'user') => {
    const hash = await bcrypt.hash(password, 4);
    const [result] = await connection.execute(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [name, email, hash, role, 'Active']
    );
    const id = Number(result.insertId);
    fixtures.userIds.push(id);
    return id;
  };
  const assertJson = (result, status) => {
    assert.equal(result.status, status, JSON.stringify(result.body));
    assert.equal(result.body.success, status < 400);
    return status < 400 ? result.body.data : result.body;
  };
  const futureDate = (days = 90) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 19);
  const eventBody = (title, overrides = {}) => ({
    title: `${title} ${tag}`,
    description: 'A temporary workflow integration event created for exercising organizer and administrator features.',
    categoryId,
    eventDate: futureDate(),
    venue: 'Workflow Test Venue',
    city: 'Test City',
    bannerImage: 'https://example.test/workflow-event.png',
    ticketPrice: 125,
    capacity: 10,
    ...overrides
  });
  const createEvent = async (client, title, overrides = {}) => {
    const result = await client.json(`${baseUrl}/organizer/events`, 'POST', eventBody(title, overrides));
    const data = assertJson(result, 201);
    assert.equal(data.event.status, 'Pending');
    assert.equal(Number(data.event.organizer_id), organizerId);
    fixtures.eventIds.push(Number(data.event.id));
    return Number(data.event.id);
  };
  const book = async (client, eventId, quantity = 1) => {
    const result = await client.json(`${baseUrl}/bookings`, 'POST', { eventId, quantity });
    const data = assertJson(result, 201);
    return Number(data.booking.id);
  };
  const approve = async (eventId) => {
    const result = await admin.json(`${baseUrl}/admin/events/${eventId}/approve`, 'PATCH');
    assert.equal(assertJson(result, 200).status, 'Approved');
    activityTypes.push('event_approve');
  };
  const sqlOne = async (query, values = []) => {
    const [rows] = await connection.execute(query, values);
    return rows[0];
  };

  try {
    await t.test('fixture accounts and authentication', async () => {
      const [[category]] = await connection.execute("SELECT id FROM categories WHERE category_name = 'Tech' LIMIT 1");
      assert.ok(category, 'seed should provide Tech category');
      categoryId = Number(category.id);
      adminId = await createFixtureUser('Workflow Administrator', emails.admin, 'admin');
      organizerId = await createFixtureUser('Workflow Organizer', emails.organizer, 'organizer');
      otherOrganizerId = await createFixtureUser('Workflow Other Organizer', emails.otherOrganizer, 'organizer');
      attendeeId = await createFixtureUser('Workflow Attendee', emails.attendee);
      attendeeTwoId = await createFixtureUser('Workflow Attendee Two', emails.attendeeTwo);
      blockedId = await createFixtureUser('Workflow Blocked User', emails.blocked);
      bookingUserId = await createFixtureUser('Workflow Booking User', emails.bookingUser);
      requestUserId = await createFixtureUser('Workflow Request User', emails.requestUser);

      for (const [client, email] of [
        [admin, emails.admin], [organizer, emails.organizer], [otherOrganizer, emails.otherOrganizer],
        [attendee, emails.attendee], [attendeeTwo, emails.attendeeTwo],
        [bookingUser, emails.bookingUser], [requestUser, emails.requestUser]
      ]) {
        assertJson(await client.json(`${baseUrl}/auth/login`, 'POST', { email, password }), 200);
      }
    });

    await t.test('organizer event validation, pending visibility, ownership, and deletion', async () => {
      const invalid = [
        eventBody('Past Event', { eventDate: '2000-01-01T10:00:00' }),
        eventBody('Negative Price Event', { ticketPrice: -1 }),
        eventBody('Zero Capacity Event', { capacity: 0 })
      ];
      for (const body of invalid) assertJson(await organizer.json(`${baseUrl}/organizer/events`, 'POST', body), 422);
      assert.equal(Number((await sqlOne('SELECT COUNT(*) AS total FROM events WHERE title LIKE ?', [`%${tag}%`])).total), 0);

      const pendingId = await createEvent(organizer, 'Pending Visibility');
      const [[owner]] = await connection.execute('SELECT organizer_id, status FROM events WHERE id = ?', [pendingId]);
      assert.equal(Number(owner.organizer_id), organizerId);
      assert.equal(owner.status, 'Pending');
      assert.equal(assertJson(
        await organizer.json(`${baseUrl}/organizer/events/${pendingId}`, 'PUT', { title: `Pending Event Edited ${tag}` }),
        200
      ).event.title, `Pending Event Edited ${tag}`);
      const editedPending = await sqlOne('SELECT status, title FROM events WHERE id = ?', [pendingId]);
      assert.equal(editedPending.status, 'Pending');
      assert.equal(editedPending.title, `Pending Event Edited ${tag}`);
      const publicList = await fetch(`${baseUrl}/events?q=${encodeURIComponent(tag)}`);
      assert.equal(publicList.status, 200);
      const publicData = await publicList.json();
      assert.ok(!publicData.data.items.some((event) => Number(event.id) === pendingId));
      assert.equal((await fetch(`${baseUrl}/events/${pendingId}`)).status, 404);
      assert.equal((await otherOrganizer.json(`${baseUrl}/organizer/events/${pendingId}`)).status, 404);
      assert.equal((await otherOrganizer.json(`${baseUrl}/organizer/events/${pendingId}`, 'PUT', { title: 'Ownership bypass attempt' })).status, 404);
      assert.equal((await otherOrganizer.json(`${baseUrl}/organizer/events/${pendingId}/bookings`)).status, 404);
      assert.equal((await otherOrganizer.fetch(`${baseUrl}/organizer/events/${pendingId}/bookings/export`)).status, 404);

      assert.equal(assertJson(await organizer.json(`${baseUrl}/organizer/events/${pendingId}`, 'DELETE'), 200).deleted, true);
      assert.equal(Number((await sqlOne('SELECT COUNT(*) AS total FROM events WHERE id = ?', [pendingId])).total), 0);
    });

    let bookedEventId;
    let cancellationEventId;
    let removalEventId;
    let rejectionEventId;
    let bookingEventId;

    await t.test('organizer approved-event edit rules, attendees, CSV, delete restriction, and reports', async () => {
      bookedEventId = await createEvent(organizer, 'Booked Event');
      await approve(bookedEventId);
      const firstBooking = await book(attendee, bookedEventId, 2);
      await book(attendeeTwo, bookedEventId, 1);

      const forbidden = [
        { eventDate: futureDate(120) },
        { ticketPrice: 126 },
        { capacity: 2 }
      ];
      for (const patch of forbidden) {
        const result = await organizer.json(`${baseUrl}/organizer/events/${bookedEventId}`, 'PUT', patch);
        assertJson(result, 409);
      }
      const increasedCapacity = assertJson(
        await organizer.json(`${baseUrl}/organizer/events/${bookedEventId}`, 'PUT', { capacity: 15 }),
        200
      ).event;
      assert.equal(Number(increasedCapacity.available_seats), 12);
      const [[inventory]] = await connection.execute(
        "SELECT capacity, available_seats, (SELECT SUM(quantity) FROM bookings WHERE event_id = ? AND booking_status = 'Confirmed') AS sold FROM events WHERE id = ?",
        [bookedEventId, bookedEventId]
      );
      assert.deepEqual(
        { capacity: Number(inventory.capacity), available: Number(inventory.available_seats), sold: Number(inventory.sold) },
        { capacity: 15, available: 12, sold: 3 }
      );
      assert.equal(assertJson(await organizer.json(`${baseUrl}/organizer/events/${bookedEventId}`, 'DELETE'), 409).success, false);

      const list = assertJson(await organizer.json(`${baseUrl}/organizer/events/${bookedEventId}/bookings?status=Confirmed`), 200);
      assert.equal(list.items.length, 2);
      const csv = await organizer.fetch(`${baseUrl}/organizer/events/${bookedEventId}/bookings/export?status=Confirmed`);
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get('content-type'), /text\/csv/);
      assert.equal(csv.body.trim().split(/\r?\n/).length - 1, list.items.length);
      assert.ok(list.items.some((item) => Number(item.booking_id) === firstBooking));

      const report = assertJson(await organizer.json(`${baseUrl}/organizer/reports?eventId=${bookedEventId}`), 200);
      const sqlTotals = await sqlOne(
        "SELECT COALESCE(SUM(CASE WHEN booking_status='Confirmed' THEN quantity ELSE 0 END),0) AS tickets, COALESCE(SUM(CASE WHEN booking_status='Confirmed' THEN total_amount ELSE 0 END),0) AS revenue FROM bookings WHERE event_id = ?",
        [bookedEventId]
      );
      assert.equal(Number(report.tickets_sold), Number(sqlTotals.tickets));
      assert.equal(Number(report.revenue), Number(sqlTotals.revenue));
      const allEventsReport = assertJson(await organizer.json(`${baseUrl}/organizer/reports`), 200);
      const organizerTotals = await sqlOne(
        "SELECT COALESCE(SUM(CASE WHEN b.booking_status='Confirmed' THEN b.quantity ELSE 0 END),0) AS tickets, COALESCE(SUM(CASE WHEN b.booking_status='Confirmed' THEN b.total_amount ELSE 0 END),0) AS revenue FROM bookings b JOIN events e ON e.id=b.event_id WHERE e.organizer_id=?",
        [organizerId]
      );
      assert.equal(Number(allEventsReport.tickets_sold), Number(organizerTotals.tickets));
      assert.equal(Number(allEventsReport.revenue), Number(organizerTotals.revenue));
    });

    await t.test('organizer cancellation cancels bookings and notifies attendees', async () => {
      cancellationEventId = await createEvent(organizer, 'Organizer Cancellation');
      await approve(cancellationEventId);
      const bookingId = await book(attendee, cancellationEventId, 1);
      const result = await organizer.json(`${baseUrl}/organizer/events/${cancellationEventId}/cancel`, 'POST', {});
      const data = assertJson(result, 200);
      assert.equal(data.status, 'Cancelled');
      assert.equal(data.notified_attendees, 1);
      const booking = await sqlOne('SELECT booking_status FROM bookings WHERE id = ?', [bookingId]);
      assert.equal(booking.booking_status, 'Cancelled');
      const notification = await sqlOne(
        'SELECT message FROM notifications WHERE user_id = ? AND message LIKE ? ORDER BY id DESC LIMIT 1',
        [attendeeId, `%${tag}%`]
      );
      assert.match(notification.message, /cancelled/i);
    });

    await t.test('admin approval, rejection reason, and event removal', async () => {
      const approvalId = await createEvent(organizer, 'Admin Approval');
      const pending = assertJson(await admin.json(`${baseUrl}/admin/events/pending`), 200);
      assert.ok(pending.items.some((event) => Number(event.id) === approvalId));
      await approve(approvalId);
      assert.equal((await fetch(`${baseUrl}/events/${approvalId}`)).status, 200);
      const approvalNotice = await sqlOne(
        'SELECT message FROM notifications WHERE user_id = ? AND message LIKE ? ORDER BY id DESC LIMIT 1',
        [organizerId, `%${tag}%approved%`]
      );
      assert.match(approvalNotice.message, /approved/i);

      rejectionEventId = await createEvent(organizer, 'Admin Rejection');
      assertJson(await admin.json(`${baseUrl}/admin/events/${rejectionEventId}/reject`, 'PATCH', {}), 422);
      const rejectResult = await admin.json(`${baseUrl}/admin/events/${rejectionEventId}/reject`, 'PATCH', { reason: 'Workflow test rejection reason.' });
      assert.equal(assertJson(rejectResult, 200).status, 'Rejected');
      const rejected = await sqlOne('SELECT status, rejection_reason FROM events WHERE id = ?', [rejectionEventId]);
      assert.equal(rejected.status, 'Rejected');
      assert.equal(rejected.rejection_reason, 'Workflow test rejection reason.');
      activityTypes.push('event_reject');

      removalEventId = await createEvent(organizer, 'Admin Removal');
      await approve(removalEventId);
      const removalBooking = await book(attendeeTwo, removalEventId, 1);
      const removeResult = await admin.json(`${baseUrl}/admin/events/${removalEventId}/remove`, 'PATCH', { reason: 'Removed for workflow integration test.' });
      assert.equal(assertJson(removeResult, 200).status, 'Removed');
      assert.equal((await fetch(`${baseUrl}/events/${removalEventId}`)).status, 404);
      assert.equal((await sqlOne('SELECT booking_status FROM bookings WHERE id = ?', [removalBooking])).booking_status, 'Cancelled');
      const [[notice]] = await connection.execute(
        'SELECT message FROM notifications WHERE user_id = ? AND message LIKE ? ORDER BY id DESC LIMIT 1',
        [attendeeTwoId, `%${tag}%removed%`]
      );
      assert.match(notice.message, /removed/i);
      const removed = await sqlOne('SELECT status FROM events WHERE id = ?', [removalEventId]);
      assert.equal(removed.status, 'Removed');
      activityTypes.push('event_remove');
    });

    await t.test('admin blocks and unblocks users, changes roles, protects accounts, and applies organizer requests', async () => {
      const blockResult = await admin.json(`${baseUrl}/admin/users/${blockedId}/status`, 'PATCH', { status: 'Blocked' });
      assert.equal(assertJson(blockResult, 200).status, 'Blocked');
      assert.equal((await blockedUser.json(`${baseUrl}/auth/login`, 'POST', { email: emails.blocked, password })).status, 403);
      const blockedRow = await sqlOne('SELECT status FROM users WHERE id = ?', [blockedId]);
      assert.equal(blockedRow.status, 'Blocked');
      activityTypes.push('user_status');

      const unblockResult = await admin.json(`${baseUrl}/admin/users/${blockedId}/status`, 'PATCH', { status: 'Active' });
      assert.equal(assertJson(unblockResult, 200).status, 'Active');
      assert.equal((await blockedUser.json(`${baseUrl}/auth/login`, 'POST', { email: emails.blocked, password })).status, 200);
      activityTypes.push('user_status');

      assert.equal(assertJson(await admin.json(`${baseUrl}/admin/users/${bookingUserId}/role`, 'PATCH', { role: 'organizer' }), 200).role, 'organizer');
      assert.equal((await sqlOne('SELECT role FROM users WHERE id = ?', [bookingUserId])).role, 'organizer');
      activityTypes.push('user_role');
      assert.equal(assertJson(await admin.json(`${baseUrl}/admin/users/${bookingUserId}/role`, 'PATCH', { role: 'user' }), 200).role, 'user');
      activityTypes.push('user_role');

      assert.equal(assertJson(await admin.json(`${baseUrl}/admin/users/${adminId}/status`, 'PATCH', { status: 'Blocked' }), 409).success, false);
      assert.equal(assertJson(await admin.json(`${baseUrl}/admin/users/${adminId}/role`, 'PATCH', { role: 'user' }), 409).success, false);
      assert.equal(assertJson(await admin.json(`${baseUrl}/admin/users/${adminId}`, 'DELETE'), 409).success, false);
      assert.equal((await sqlOne('SELECT role, status FROM users WHERE id = ?', [adminId])).role, 'admin');
      assert.equal((await sqlOne('SELECT status FROM users WHERE id = ?', [adminId])).status, 'Active');

      bookingEventId = await createEvent(organizer, 'Delete Guard Booking');
      await approve(bookingEventId);
      await book(bookingUser, bookingEventId, 1);
      assertJson(await admin.json(`${baseUrl}/admin/users/${bookingUserId}`, 'DELETE'), 409);
      assert.equal(Number((await sqlOne('SELECT COUNT(*) AS total FROM users WHERE id = ?', [bookingUserId])).total), 1);
      assertJson(await admin.json(`${baseUrl}/admin/users/${organizerId}`, 'DELETE'), 409);
      assert.equal(Number((await sqlOne('SELECT COUNT(*) AS total FROM users WHERE id = ?', [organizerId])).total), 1);

      const requestResult = await requestUser.json(`${baseUrl}/organizer-requests`, 'POST', {
        organizationName: `Workflow Org ${tag}`,
        reason: 'Requesting organizer access for the workflow integration test.'
      });
      const requestData = assertJson(requestResult, 201);
      fixtures.requestIds.push(Number(requestData.id));
      const approval = await admin.json(`${baseUrl}/admin/organizer-requests/${requestData.id}/approve`, 'PATCH');
      assert.equal(assertJson(approval, 200).status, 'Approved');
      assert.equal((await sqlOne('SELECT role, organization_name FROM users WHERE id = ?', [requestUserId])).role, 'organizer');
      activityTypes.push('organizer_request_approve');
      assertJson(await requestUser.json(`${baseUrl}/auth/login`, 'POST', { email: emails.requestUser, password }), 200);
      assert.equal((await requestUser.json(`${baseUrl}/organizer/dashboard`)).status, 200);
    });

    await t.test('last active administrator cannot be blocked', async () => {
      const [rows] = await connection.execute("SELECT id, status FROM users WHERE role = 'admin' AND id <> ?", [adminId]);
      seedAdminStatuses = rows.map((row) => ({ id: Number(row.id), status: row.status }));
      await connection.beginTransaction();
      await connection.execute("UPDATE users SET status = 'Blocked' WHERE role = 'admin' AND id <> ?", [adminId]);
      await connection.commit();
      try {
        await assert.rejects(
          setUserStatus(seedAdminStatuses[0]?.id || adminId + 1000000, adminId, 'Blocked'),
          (error) => error.status === 409 && /at least one active administrator/i.test(error.message)
        );
        assert.equal((await sqlOne('SELECT status FROM users WHERE id = ?', [adminId])).status, 'Active');
      } finally {
        for (const row of seedAdminStatuses) {
          await connection.execute('UPDATE users SET status = ? WHERE id = ?', [row.status, row.id]);
        }
      }
    });

    await t.test('admin categories, date-range reports, CSV export, and activity log', async () => {
      const created = assertJson(
        await admin.json(`${baseUrl}/admin/categories`, 'POST', { categoryName: `Workflow ${tag}` }),
        201
      );
      const inUseCategoryId = Number(created.id);
      fixtures.categoryIds.push(inUseCategoryId);
      activityTypes.push('category_create');

      const renamed = assertJson(
        await admin.json(`${baseUrl}/admin/categories/${inUseCategoryId}`, 'PUT', { categoryName: `Renamed ${tag}` }),
        200
      );
      assert.equal(renamed.category_name, `Renamed ${tag}`);
      activityTypes.push('category_update');
      const categoryEventId = await createEvent(organizer, 'Category In Use', { categoryId: inUseCategoryId });
      assertJson(await admin.json(`${baseUrl}/admin/categories/${inUseCategoryId}`, 'DELETE'), 409);
      assertJson(await organizer.json(`${baseUrl}/organizer/events/${categoryEventId}`, 'DELETE'), 200);

      const unused = assertJson(
        await admin.json(`${baseUrl}/admin/categories`, 'POST', { categoryName: `Unused ${tag}` }),
        201
      );
      const unusedCategoryId = Number(unused.id);
      fixtures.categoryIds.push(unusedCategoryId);
      activityTypes.push('category_create');
      assert.equal(assertJson(await admin.json(`${baseUrl}/admin/categories/${unusedCategoryId}`, 'DELETE'), 200).deleted, true);
      fixtures.categoryIds = fixtures.categoryIds.filter((id) => id !== unusedCategoryId);
      activityTypes.push('category_delete');

      const report = assertJson(
        await admin.json(`${baseUrl}/admin/reports?range=custom&from=2000-01-01&to=2099-12-31`),
        200
      );
      const sqlTotals = await sqlOne(
        "SELECT COUNT(*) AS bookings, COALESCE(SUM(CASE WHEN booking_status='Confirmed' THEN quantity ELSE 0 END),0) AS tickets_sold, COALESCE(SUM(CASE WHEN booking_status='Confirmed' THEN total_amount ELSE 0 END),0) AS revenue, SUM(booking_status='Cancelled') AS cancelled FROM bookings WHERE created_at >= '2000-01-01' AND created_at < DATE_ADD('2099-12-31', INTERVAL 1 DAY)"
      );
      assert.equal(Number(report.bookings), Number(sqlTotals.bookings));
      assert.equal(Number(report.tickets_sold), Number(sqlTotals.tickets_sold));
      assert.equal(Number(report.revenue), Number(sqlTotals.revenue));
      assert.equal(Number(report.cancelled || 0), Number(sqlTotals.cancelled || 0));

      const csv = await admin.fetch(`${baseUrl}/admin/reports/export?range=custom&from=2000-01-01&to=2099-12-31`);
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get('content-type'), /text\/csv/);
      assert.ok(csv.body.includes(`Booked Event ${tag}`));
      assert.equal(csv.body.trim().split(/\r?\n/).length - 1, report.top_events.length);
      const dashboard = assertJson(await admin.json(`${baseUrl}/admin/dashboard`), 200);
      for (const key of ['total_users', 'organizers', 'events', 'pending_approvals', 'bookings', 'cancelled_bookings', 'revenue']) {
        assert.ok(Object.hasOwn(dashboard, key), `admin dashboard is missing ${key}`);
      }

      const adminActivity = assertJson(await admin.json(`${baseUrl}/admin/activity?limit=50`), 200);
      for (const actionType of new Set(activityTypes)) {
        const expected = activityTypes.filter((value) => value === actionType).length;
        const actual = adminActivity.items.filter((item) => Number(item.admin_id) === adminId && item.action_type === actionType).length;
        assert.ok(actual >= expected, `${actionType}: expected at least ${expected} activity entries, got ${actual}`);
      }
      const [allActivity] = await connection.execute('SELECT action_type FROM activity_log WHERE admin_id = ?', [adminId]);
      for (const actionType of activityTypes) {
        assert.ok(allActivity.some((item) => item.action_type === actionType), `missing activity entry for ${actionType}`);
      }
    });
  } finally {
    try {
      await connection.beginTransaction();
      for (const row of seedAdminStatuses) {
        await connection.execute('UPDATE users SET status = ? WHERE id = ?', [row.status, row.id]);
      }
      if (fixtures.requestIds.length) {
        const marks = fixtures.requestIds.map(() => '?').join(',');
        await connection.execute(`DELETE FROM organizer_requests WHERE id IN (${marks})`, fixtures.requestIds);
      }
      if (fixtures.userIds.length) {
        const marks = fixtures.userIds.map(() => '?').join(',');
        await connection.execute(`DELETE FROM notifications WHERE user_id IN (${marks})`, fixtures.userIds);
      }
      if (fixtures.eventIds.length) {
        const marks = fixtures.eventIds.map(() => '?').join(',');
        await connection.execute(`DELETE FROM bookings WHERE event_id IN (${marks})`, fixtures.eventIds);
        await connection.execute(`DELETE FROM events WHERE id IN (${marks})`, fixtures.eventIds);
      }
      if (fixtures.userIds.length) {
        await connection.execute('DELETE FROM activity_log WHERE admin_id = ?', [adminId]);
        const marks = fixtures.userIds.map(() => '?').join(',');
        await connection.execute(`DELETE FROM notifications WHERE user_id IN (${marks})`, fixtures.userIds);
        await connection.execute(`DELETE FROM organizer_requests WHERE user_id IN (${marks})`, fixtures.userIds);
        await connection.execute(`DELETE FROM users WHERE id IN (${marks})`, fixtures.userIds);
      }
      if (fixtures.categoryIds.length) {
        const marks = fixtures.categoryIds.map(() => '?').join(',');
        await connection.execute(`DELETE FROM categories WHERE id IN (${marks})`, fixtures.categoryIds);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await pool.end();
    }
  }
});
