import 'dotenv/config';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import test from 'node:test';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(backendRoot, '..');
const testDatabase = 'eventease_test';

if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
  throw new Error('Set DB_USER and DB_PASSWORD in eventease-backend/.env before running user security tests.');
}

process.env.NODE_ENV = 'test';
process.env.DB_NAME = testDatabase;
process.env.JWT_SECRET ||= 'test-only-secret-with-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN ||= '1d';
process.env.CLIENT_ORIGIN ||= 'http://localhost:8000';
process.env.COOKIE_SECURE ||= 'false';

const [{ app }, { pool }, { env }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/db.js'),
  import('../src/config/env.js')
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

  constructor(token) {
    if (token) this.cookies.set('eventease_token', token);
  }

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

function assertNoCredentials(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoCredentials);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.doesNotMatch(key, /password|password_hash/i, `Sensitive API property: ${key}`);
    assertNoCredentials(nested);
  }
}

test('Static root HTML links resolve and API content is escaped before HTML insertion', async () => {
  const pages = await readdir(projectRoot);
  const htmlFiles = pages.filter((name) => name.endsWith('.html'));
  const contents = new Map(await Promise.all(htmlFiles.map(async (name) => [
    name,
    await readFile(path.join(projectRoot, name), 'utf8')
  ])));
  const broken = [];
  const attributes = /<(a|link|script|img|source|iframe|form)\b[^>]*?\b(href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

  for (const [name, html] of contents) {
    const ids = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
    for (const match of html.matchAll(attributes)) {
      const [, tag, attribute, doubleQuoted, singleQuoted, unquoted] = match;
      const value = (doubleQuoted ?? singleQuoted ?? unquoted ?? '').replaceAll('&amp;', '&').trim();
      if (!value) continue;
      const parsed = new URL(value, `http://eventease.test/${name}`);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== 'http://eventease.test') continue;
      const targetName = decodeURIComponent(parsed.pathname.split('/').pop() || name);
      const targetPath = path.resolve(projectRoot, decodeURIComponent(parsed.pathname.slice(1)));
      if (targetPath !== projectRoot && !targetPath.startsWith(`${projectRoot}${path.sep}`)) {
        broken.push(`${name}: ${attribute}=${value} escapes the project root`);
      } else if (parsed.pathname !== '/' && !await exists(targetPath)) {
        broken.push(`${name}: ${attribute}=${value} target does not exist`);
      } else if (parsed.hash && (!contents.has(targetName) || !new Set([...contents.get(targetName).matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((item) => item[1])).has(decodeURIComponent(parsed.hash.slice(1))))) {
        broken.push(`${name}: ${attribute}=${value} fragment does not exist`);
      } else if (attribute === 'href' && !['a', 'link'].includes(tag)) {
        broken.push(`${name}: unexpected href element ${tag}`);
      }
    }
  }
  assert.deepEqual(broken, [], `Broken root HTML references:\n${broken.join('\n')}`);

  const assetFiles = (await readdir(path.join(projectRoot, 'assets'))).filter((name) => name.endsWith('.js'));
  const assetSources = new Map(await Promise.all(assetFiles.map(async (name) => [
    name,
    await readFile(path.join(projectRoot, 'assets', name), 'utf8')
  ])));
  const publicEvents = assetSources.get('public-events.js');
  const script = assetSources.get('script.js');
  const panel = assetSources.get('panel.js');
  const htmlInsertionLines = [...assetSources.values()].join('\n').split(/\r?\n/)
    .filter((line) => /innerHTML\s*=|insertAdjacentHTML\s*\(/.test(line));
  const rawApiInsertion = htmlInsertionLines.filter((line) =>
    /\$\{\s*(?:event|user|booking|item|ticket|notification|category)\.(?:title|name|message|description|venue|city|email|category_name|eventTitle|ticket_id)\s*\}/i.test(line)
    && !/\.map\(\((?:item|value)\)\s*=>[\s\S]*escapeHtml\((?:item|value)\)/i.test(line)
  );
  assert.ok(htmlInsertionLines.length > 0, 'Expected to inspect HTML insertion points.');
  assert.deepEqual(rawApiInsertion, [], `Unescaped API data in HTML insertion:\n${rawApiInsertion.join('\n')}`);
  assert.match(publicEvents, /escapeHtml\(event\.title\)/);
  assert.match(publicEvents, /pageTitle\) pageTitle\.textContent = event\.title/);
  assert.match(publicEvents, /pageDescription\) pageDescription\.textContent = event\.description/);
  assert.match(script, /escapeHtml\(item\.title\)/);
  assert.match(script, /escapeHtml\(booking\.eventTitle\)/);
  assert.match(script, /heading\.textContent = `Hello, \$\{user\.name\}!`/);
  assert.doesNotMatch(publicEvents, /<h3>\$\{event\.title\}<\/h3>/);
  assert.doesNotMatch(script, /<h3>\$\{(?:item|booking)\.(?:title|eventTitle)\}<\/h3>/);
  assert.doesNotMatch(panel, /<strong>\$\{user\.name\}<\/strong>/);
  assert.ok(!htmlInsertionLines.some((line) => /<h[1-6]>?\$\{(?:event|user|booking|item)\.(?:title|name|description|eventTitle)\}/.test(line)));
  console.log(`Static link check: ${htmlFiles.length} pages, no broken references; reviewed ${htmlInsertionLines.length} HTML insertion lines for API-data escaping.`);
});

test('Guest, user, security, and access workflows: HTTP responses and database state', async (t) => {
  const tag = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const password = 'UserSecurityTest!2026';
  const emails = {
    user: `security-user-${tag}@example.test`,
    otherUser: `security-other-${tag}@example.test`,
    organizer: `security-organizer-${tag}@example.test`,
    admin: `security-admin-${tag}@example.test`,
    blocked: `security-blocked-${tag}@example.test`
  };
  const ids = { users: [], events: [], bookings: [], contacts: [] };
  const connection = await pool.getConnection();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const anonymous = new CookieJar();
  const user = new CookieJar();
  const otherUser = new CookieJar();
  const organizer = new CookieJar();
  const admin = new CookieJar();
  const blockedUser = new CookieJar();
  let userId;
  let otherUserId;
  let organizerId;
  let adminId;
  let blockedId;
  let techCategoryId;
  let musicCategoryId;
  let testEventIds = {};
  let userBookingIds = [];
  let userTicketIds = [];
  let mainPasswordHash;

  const assertJson = (result, expectedStatus) => {
    assert.equal(result.status, expectedStatus, JSON.stringify(result.body));
    return expectedStatus < 400 ? result.body.data : result.body;
  };
  const queryOne = async (sql, values = []) => {
    const [rows] = await connection.execute(sql, values);
    return rows[0];
  };
  const createFixtureUser = async (name, email, role = 'user', status = 'Active') => {
    const hash = await bcrypt.hash(password, 4);
    const [result] = await connection.execute(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [name, email, hash, role, status]
    );
    const id = Number(result.insertId);
    ids.users.push(id);
    return id;
  };
  const tokenFor = (id) => jwt.sign({}, env.JWT_SECRET, { subject: String(id), expiresIn: env.JWT_EXPIRES_IN });
  const insertEvent = async (title, { status = 'Approved', days = 45, price = 100, capacity = 20, available = capacity, categoryId = techCategoryId } = {}) => {
    const eventDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 19);
    const [result] = await connection.execute(
      'INSERT INTO events (title, description, category_id, event_date, venue, city, banner_image, ticket_price, capacity, available_seats, organizer_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, 'Temporary user-security test event for validating public discovery and booking safeguards.', categoryId, eventDate, 'Security Test Venue', 'Test City', 'https://example.test/security.png', price, capacity, available, organizerId, status]
    );
    const id = Number(result.insertId);
    ids.events.push(id);
    return id;
  };
  const book = async (jar, eventId, quantity) => {
    const result = await jar.json(`${baseUrl}/bookings`, 'POST', { eventId, quantity });
    const data = assertJson(result, 201);
    ids.bookings.push(Number(data.booking.id));
    userBookingIds.push(Number(data.booking.id));
    userTicketIds.push(data.booking.ticket_id);
    return data.booking;
  };
  const assertSensitiveFree = (response) => {
    assertNoCredentials(response.body);
    const text = JSON.stringify(response.body);
    assert.ok(!text.includes(password), 'An API response contained the submitted password.');
    if (mainPasswordHash) assert.ok(!text.includes(mainPasswordHash), 'An API response contained the stored password hash.');
  };
  const isDenied = (response) => assert.ok([401, 403].includes(response.status), `Expected 401/403; got ${response.status}`);

  try {
    await t.test('registration validation, duplicate email, login, role, logout, and cookie attributes', async () => {
      const invalid = [
        {},
        { name: 'Valid Name', email: 'not-an-email', password },
        { name: 'Valid Name', email: `short-${tag}@example.test`, password: 'short' }
      ];
      for (const body of invalid) assertJson(await anonymous.json(`${baseUrl}/auth/register`, 'POST', body), 422);
      assert.equal(Number((await queryOne('SELECT COUNT(*) AS total FROM users WHERE email = ?', [`short-${tag}@example.test`])).total), 0);

      const registration = await user.json(`${baseUrl}/auth/register`, 'POST', {
        name: 'Security Test User',
        email: emails.user,
        password
      });
      const registrationData = assertJson(registration, 201);
      userId = Number(registrationData.user.id);
      ids.users.push(userId);
      assert.equal(registrationData.user.role, 'user');
      assertSensitiveFree(registration);
      const registrationCookie = registration.headers.getSetCookie().find((value) => value.startsWith('eventease_token='));
      assert.ok(registrationCookie);
      assert.match(registrationCookie, /HttpOnly/i);
      assert.match(registrationCookie, /SameSite=Lax/i);
      const logoutJar = new CookieJar(registrationCookie.split(';')[0].slice('eventease_token='.length));

      const duplicate = await anonymous.json(`${baseUrl}/auth/register`, 'POST', {
        name: 'Security Test User',
        email: emails.user,
        password
      });
      assert.equal(assertJson(duplicate, 409).success, false);

      const stored = await queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
      mainPasswordHash = stored.password_hash;
      assert.match(mainPasswordHash, /^\$2[aby]\$\d\d\$/);
      assert.equal(await bcrypt.compare(password, mainPasswordHash), true);

      const login = await user.json(`${baseUrl}/auth/login`, 'POST', { email: emails.user, password });
      const loginData = assertJson(login, 200);
      assert.equal(loginData.user.id, userId);
      assertSensitiveFree(login);
      const loginCookie = login.headers.getSetCookie().find((value) => value.startsWith('eventease_token='));
      assert.match(loginCookie, /HttpOnly/i);
      assert.match(loginCookie, /SameSite=Lax/i);

      const me = await user.json(`${baseUrl}/auth/me`);
      assert.equal(assertJson(me, 200).user.role, 'user');
      assertSensitiveFree(me);
      const logout = await logoutJar.json(`${baseUrl}/auth/logout`, 'POST', {});
      assert.equal(assertJson(logout, 200).loggedOut, true);
      assert.match(logout.headers.getSetCookie().join(';'), /Expires=Thu, 01 Jan 1970/i);
      assert.equal((await logoutJar.json(`${baseUrl}/auth/me`)).status, 401);
    });

    await t.test('login failures, blocked account, and parameterized login/search inputs', async () => {
      const wrongPassword = await anonymous.json(`${baseUrl}/auth/login`, 'POST', { email: emails.user, password: "' OR 1=1 --" });
      assert.equal(assertJson(wrongPassword, 401).success, false);
      const unknownEmail = await anonymous.json(`${baseUrl}/auth/login`, 'POST', { email: `missing-${tag}@example.test`, password });
      assert.equal(assertJson(unknownEmail, 401).success, false);

      otherUserId = await createFixtureUser('Other Security User', emails.otherUser);
      organizerId = await createFixtureUser('Security Organizer', emails.organizer, 'organizer');
      adminId = await createFixtureUser('Security Administrator', emails.admin, 'admin');
      blockedId = await createFixtureUser('Blocked Security User', emails.blocked, 'user', 'Blocked');
      otherUser.cookies.set('eventease_token', tokenFor(otherUserId));
      organizer.cookies.set('eventease_token', tokenFor(organizerId));
      admin.cookies.set('eventease_token', tokenFor(adminId));

      const blockedLogin = await blockedUser.json(`${baseUrl}/auth/login`, 'POST', { email: emails.blocked, password });
      assert.equal(assertJson(blockedLogin, 403).success, false);

      const injectionSearch = await fetch(`${baseUrl}/events?q=${encodeURIComponent("' OR 1=1 --")}&limit=50`);
      assert.equal(injectionSearch.status, 200);
      const injectionData = await injectionSearch.json();
      assert.equal(injectionData.success, true);
      assert.ok(!injectionData.data.items.some((event) => String(event.title).includes(tag)));
    });

    await t.test('public listing, event search/filter/sort, sold-out state, and quantity validation', async () => {
      const [[tech]] = await connection.execute("SELECT id FROM categories WHERE category_name = 'Tech' LIMIT 1");
      const [[music]] = await connection.execute("SELECT id FROM categories WHERE category_name = 'Music' LIMIT 1");
      assert.ok(tech && music, 'seed categories Tech and Music must exist');
      techCategoryId = Number(tech.id);
      musicCategoryId = Number(music.id);

      testEventIds.cheap = await insertEvent(`Security Cheap ${tag}`, { price: 10, categoryId: techCategoryId, capacity: 20 });
      testEventIds.expensive = await insertEvent(`Security Expensive ${tag}`, { price: 200, categoryId: techCategoryId, capacity: 20 });
      testEventIds.music = await insertEvent(`Security Music ${tag}`, { price: 60, categoryId: musicCategoryId, capacity: 20 });
      testEventIds.soldOut = await insertEvent(`Security Sold Out ${tag}`, { price: 25, capacity: 1, available: 0 });
      testEventIds.pending = await insertEvent(`Security Pending ${tag}`, { status: 'Pending' });
      testEventIds.past = await insertEvent(`Security Past ${tag}`, { days: -2 });
      testEventIds.script = await insertEvent(`<script>alert('event-${tag}')</script>`, { price: 80 });

      const listResponse = await fetch(`${baseUrl}/events?q=${encodeURIComponent(tag)}&limit=50`);
      assert.equal(listResponse.status, 200);
      const list = await listResponse.json();
      assert.equal(list.success, true);
      const visibleIds = list.data.items.map((event) => Number(event.id));
      assert.ok(visibleIds.includes(testEventIds.cheap));
      assert.ok(visibleIds.includes(testEventIds.soldOut));
      assert.ok(visibleIds.includes(testEventIds.script));
      assert.ok(!visibleIds.includes(testEventIds.pending));
      assert.ok(!visibleIds.includes(testEventIds.past));
      assert.equal((await fetch(`${baseUrl}/events/${testEventIds.pending}`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/events/${testEventIds.past}`)).status, 404);
      for (const event of list.data.items) {
        assert.equal(event.status, 'Approved');
        assert.ok(new Date(event.event_date) > new Date());
      }

      const search = await fetch(`${baseUrl}/events?q=Cheap&limit=50`);
      const searched = await search.json();
      assert.deepEqual(searched.data.items.map((event) => Number(event.id)), [testEventIds.cheap]);
      const category = await fetch(`${baseUrl}/events?category=Music&q=${encodeURIComponent(tag)}&limit=50`);
      const categoryData = await category.json();
      assert.deepEqual(categoryData.data.items.map((event) => Number(event.id)), [testEventIds.music]);
      const noMatch = await fetch(`${baseUrl}/events?q=zzqxxvbnm&limit=50`);
      assert.deepEqual((await noMatch.json()).data.items, []);
      const freeFilter = await fetch(`${baseUrl}/events?price=free&q=${encodeURIComponent(tag)}&limit=50`);
      assert.deepEqual((await freeFilter.json()).data.items, []);
      const lowSort = await fetch(`${baseUrl}/events?sort=low&q=${encodeURIComponent(tag)}&limit=50`);
      const lowItems = (await lowSort.json()).data.items;
      const highSort = await fetch(`${baseUrl}/events?sort=high&q=${encodeURIComponent(tag)}&limit=50`);
      const highItems = (await highSort.json()).data.items;
      assert.equal(Number(lowItems[0].id), testEventIds.cheap);
      assert.equal(Number(highItems[0].id), testEventIds.expensive);

      const scriptEvent = await fetch(`${baseUrl}/events/${testEventIds.script}`);
      const scriptData = await scriptEvent.json();
      assert.equal(scriptData.data.event.title, `<script>alert('event-${tag}')</script>`);
      const [[storedEvent]] = await connection.execute('SELECT title FROM events WHERE id = ?', [testEventIds.script]);
      assert.equal(storedEvent.title, scriptData.data.event.title);
      const soldOutDetails = await fetch(`${baseUrl}/events/${testEventIds.soldOut}`);
      assert.equal(soldOutDetails.status, 200);
      assert.equal((await soldOutDetails.json()).data.event.available_seats, 0);
      const soldOutBooking = await user.json(`${baseUrl}/bookings`, 'POST', { eventId: testEventIds.soldOut, quantity: 1 });
      assert.equal(assertJson(soldOutBooking, 409).success, false);

      const oneSeatEvent = await insertEvent(`Quantity One ${tag}`, { capacity: 20 });
      const tenSeatEvent = await insertEvent(`Quantity Ten ${tag}`, { capacity: 20 });
      const invalidZero = await user.json(`${baseUrl}/bookings`, 'POST', { eventId: oneSeatEvent, quantity: 0 });
      assert.equal(assertJson(invalidZero, 422).success, false);
      assert.equal(Number((await queryOne('SELECT COUNT(*) AS total FROM bookings WHERE event_id = ?', [oneSeatEvent])).total), 0);
      const invalidEleven = await user.json(`${baseUrl}/bookings`, 'POST', { eventId: tenSeatEvent, quantity: 11 });
      assert.equal(assertJson(invalidEleven, 422).success, false);
      assert.equal(Number((await queryOne('SELECT COUNT(*) AS total FROM bookings WHERE event_id = ?', [tenSeatEvent])).total), 0);
      const one = await book(user, oneSeatEvent, 1);
      const ten = await book(user, tenSeatEvent, 10);
      assert.equal(one.quantity, 1);
      assert.equal(ten.quantity, 10);
      const oneRemaining = await queryOne('SELECT available_seats FROM events WHERE id = ?', [oneSeatEvent]);
      const tenRemaining = await queryOne('SELECT available_seats FROM events WHERE id = ?', [tenSeatEvent]);
      assert.equal(Number(oneRemaining.available_seats), 19);
      assert.equal(Number(tenRemaining.available_seats), 10);
      const overCapacityEvent = await insertEvent(`Over Capacity ${tag}`, { capacity: 2 });
      const overCapacity = await user.json(`${baseUrl}/bookings`, 'POST', { eventId: overCapacityEvent, quantity: 3 });
      assert.equal(assertJson(overCapacity, 409).success, false);
      assert.equal(Number((await queryOne('SELECT available_seats FROM events WHERE id = ?', [overCapacityEvent])).available_seats), 2);
    });

    await t.test('ticket privacy, booking ownership, cancellation limits, and seat restoration', async () => {
      const shareEvent = await insertEvent(`Ownership ${tag}`, { capacity: 10 });
      const ownBooking = await book(user, shareEvent, 2);
      const otherBookingResult = await otherUser.json(`${baseUrl}/bookings`, 'POST', { eventId: shareEvent, quantity: 1 });
      const otherBooking = assertJson(otherBookingResult, 201).booking;
      ids.bookings.push(Number(otherBooking.id));
      const wrongRead = await otherUser.json(`${baseUrl}/bookings/${ownBooking.id}`);
      assert.equal(assertJson(wrongRead, 404).success, false);
      const wrongCancel = await otherUser.json(`${baseUrl}/bookings/${ownBooking.id}/cancel`, 'POST', {});
      assert.equal(assertJson(wrongCancel, 404).success, false);
      const otherTickets = assertJson(await otherUser.json(`${baseUrl}/tickets`), 200);
      assert.ok(otherTickets.items.some((ticket) => Number(ticket.booking_id) === Number(otherBooking.id)));
      assert.ok(!otherTickets.items.some((ticket) => Number(ticket.booking_id) === Number(ownBooking.id)));

      const ticketListResponse = await user.json(`${baseUrl}/tickets`);
      const ticketList = assertJson(ticketListResponse, 200);
      assertSensitiveFree(ticketListResponse);
      assert.ok(ticketList.items.some((ticket) => Number(ticket.booking_id) === Number(ownBooking.id)));
      assert.ok(!ticketList.items.some((ticket) => Number(ticket.booking_id) === Number(otherBooking.id)));
      const [savedTickets] = await connection.execute(
        'SELECT ticket_id FROM bookings WHERE id IN (?, ?) ORDER BY ticket_id',
        [ownBooking.id, otherBooking.id]
      );
      assert.equal(new Set(savedTickets.map((row) => row.ticket_id)).size, 2);
      assert.equal(new Set([...userTicketIds, otherBooking.ticket_id]).size, userTicketIds.length + 1);

      const ownBookingsResponse = await user.json(`${baseUrl}/bookings`);
      const ownBookings = assertJson(ownBookingsResponse, 200);
      assertSensitiveFree(ownBookingsResponse);
      assert.ok(ownBookings.items.some((booking) => Number(booking.id) === Number(ownBooking.id)));
      assert.ok(!ownBookings.items.some((booking) => Number(booking.id) === Number(otherBooking.id)));
      const bookingSearch = await user.json(`${baseUrl}/bookings?q=${encodeURIComponent(String(ownBooking.id))}&status=Confirmed`);
      assert.ok(assertJson(bookingSearch, 200).items.some((booking) => Number(booking.id) === Number(ownBooking.id)));

      const restorableEvent = await insertEvent(`Restorable ${tag}`, { capacity: 5, available: 5 });
      const restorable = await book(user, restorableEvent, 2);
      const cancelled = await user.json(`${baseUrl}/bookings/${restorable.id}/cancel`, 'POST', {});
      assert.equal(assertJson(cancelled, 200).booking_status, 'Cancelled');
      assert.equal((await queryOne('SELECT booking_status FROM bookings WHERE id = ?', [restorable.id])).booking_status, 'Cancelled');
      assert.equal(Number((await queryOne('SELECT available_seats FROM events WHERE id = ?', [restorableEvent])).available_seats), 5);
      const ticketsAfterCancel = assertJson(await user.json(`${baseUrl}/tickets`), 200);
      assert.ok(!ticketsAfterCancel.items.some((ticket) => Number(ticket.booking_id) === Number(restorable.id)));
      const notificationList = assertJson(await user.json(`${baseUrl}/notifications`), 200);
      const cancellationNotice = notificationList.items.find((item) => item.message.includes(restorable.ticket_id));
      assert.ok(cancellationNotice);
      const marked = await user.json(`${baseUrl}/notifications/${cancellationNotice.id}/read`, 'PATCH', {});
      assert.equal(assertJson(marked, 200).is_read, true);

      const insideEvent = await insertEvent(`Inside Limit ${tag}`, { days: 0.5, capacity: 2 });
      const inside = await book(user, insideEvent, 1);
      const insideCancel = await user.json(`${baseUrl}/bookings/${inside.id}/cancel`, 'POST', {});
      assert.equal(assertJson(insideCancel, 409).success, false);
      assert.equal((await queryOne('SELECT booking_status FROM bookings WHERE id = ?', [inside.id])).booking_status, 'Confirmed');

      const exactEvent = await insertEvent(`Exact Limit ${tag}`, { days: 2, capacity: 2 });
      const exact = await book(user, exactEvent, 1);
      await connection.execute('UPDATE events SET event_date = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR) WHERE id = ?', [exactEvent]);
      const exactCancel = await user.json(`${baseUrl}/bookings/${exact.id}/cancel`, 'POST', {});
      assert.equal(assertJson(exactCancel, 409).success, false);
      assert.equal((await queryOne('SELECT booking_status FROM bookings WHERE id = ?', [exact.id])).booking_status, 'Confirmed');
    });

    await t.test('API credential privacy, profile/contact text storage, and role access controls', async () => {
      const userResponse = await user.json(`${baseUrl}/auth/me`);
      assertSensitiveFree(userResponse);
      assert.equal(assertJson(userResponse, 200).user.role, 'user');
      assert.equal(assertJson(await organizer.json(`${baseUrl}/auth/me`), 200).user.role, 'organizer');
      assert.equal(assertJson(await admin.json(`${baseUrl}/auth/me`), 200).user.role, 'admin');

      const usersResponse = await admin.json(`${baseUrl}/admin/users?q=${encodeURIComponent(emails.user)}`);
      assertSensitiveFree(usersResponse);
      assert.ok(assertJson(usersResponse, 200).items.some((item) => Number(item.id) === userId));

      const bookingResponse = await user.json(`${baseUrl}/bookings`);
      assertSensitiveFree(bookingResponse);

      const profileName = `<script>alert('profile-${tag}')</script>`;
      const profileResponse = await user.json(`${baseUrl}/auth/profile`, 'PUT', { name: profileName, phone: '+1-555-0101' });
      assert.equal(assertJson(profileResponse, 200).user.name, profileName);
      const profileRow = await queryOne('SELECT name, phone FROM users WHERE id = ?', [userId]);
      assert.equal(profileRow.name, profileName);
      assert.equal(profileRow.phone, '+1-555-0101');

      const wrongCurrentPassword = await user.json(`${baseUrl}/auth/password`, 'PUT', {
        currentPassword: 'IncorrectCurrentPassword!2026',
        newPassword: 'ChangedSecurityTest!2026'
      });
      assert.equal(assertJson(wrongCurrentPassword, 422).success, false);
      assert.equal(await bcrypt.compare(password, (await queryOne('SELECT password_hash FROM users WHERE id = ?', [userId])).password_hash), true);
      const passwordUpdate = await user.json(`${baseUrl}/auth/password`, 'PUT', {
        currentPassword: password,
        newPassword: 'ChangedSecurityTest!2026'
      });
      assert.equal(assertJson(passwordUpdate, 200).updated, true);
      const changedHash = (await queryOne('SELECT password_hash FROM users WHERE id = ?', [userId])).password_hash;
      assert.equal(await bcrypt.compare('ChangedSecurityTest!2026', changedHash), true);
      const relogin = await anonymous.json(`${baseUrl}/auth/login`, 'POST', {
        email: emails.user,
        password: 'ChangedSecurityTest!2026'
      });
      assert.equal(assertJson(relogin, 200).user.id, userId);
      assertSensitiveFree(profileResponse);
      assertSensitiveFree(passwordUpdate);
      assertSensitiveFree(relogin);

      const contactMessage = `<script>alert('contact-${tag}')</script>`;
      const contactResponse = await anonymous.json(`${baseUrl}/contact`, 'POST', {
        name: 'Security Contact',
        email: emails.user,
        message: contactMessage
      });
      const contactData = assertJson(contactResponse, 201);
      ids.contacts.push(Number(contactData.id));
      assert.equal((await queryOne('SELECT message FROM contact_messages WHERE id = ?', [contactData.id])).message, contactMessage);

      const routePaths = ['/organizer/dashboard', '/admin/dashboard', '/bookings', '/tickets', '/dashboard/summary'];
      const loggedOut = new CookieJar();
      for (const route of routePaths) isDenied(await loggedOut.json(`${baseUrl}${route}`));
      for (const route of ['/organizer/dashboard', '/admin/dashboard']) isDenied(await user.json(`${baseUrl}${route}`));
      for (const route of ['/admin/dashboard', '/bookings', '/tickets']) isDenied(await organizer.json(`${baseUrl}${route}`));
      for (const route of ['/organizer/dashboard', '/bookings', '/tickets']) isDenied(await admin.json(`${baseUrl}${route}`));
      const adminBooking = await admin.json(`${baseUrl}/bookings`, 'POST', { eventId: testEventIds.cheap, quantity: 1 });
      assert.equal(assertJson(adminBooking, 403).success, false);
    });
  } finally {
    try {
      await connection.beginTransaction();
      if (ids.bookings.length) {
        const marks = ids.bookings.map(() => '?').join(',');
        await connection.execute(`DELETE FROM payments WHERE booking_id IN (${marks})`, ids.bookings);
        await connection.execute(`DELETE FROM bookings WHERE id IN (${marks})`, ids.bookings);
      }
      if (ids.events.length) {
        const marks = ids.events.map(() => '?').join(',');
        await connection.execute(`DELETE FROM events WHERE id IN (${marks})`, ids.events);
      }
      if (ids.contacts.length) {
        const marks = ids.contacts.map(() => '?').join(',');
        await connection.execute(`DELETE FROM contact_messages WHERE id IN (${marks})`, ids.contacts);
      }
      if (ids.users.length) {
        const marks = ids.users.map(() => '?').join(',');
        await connection.execute(`DELETE FROM notifications WHERE user_id IN (${marks})`, ids.users);
        await connection.execute(`DELETE FROM organizer_requests WHERE user_id IN (${marks})`, ids.users);
        await connection.execute(`DELETE FROM users WHERE id IN (${marks})`, ids.users);
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

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
