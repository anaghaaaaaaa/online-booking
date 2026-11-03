import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, request, test } from '@playwright/test';
import jsQR from 'jsqr';
import mysql from 'mysql2/promise';
import { PNG } from 'pngjs';
import { API, SITE, eventFromApi, login, makeContext, registerThroughApi } from './helpers.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90000);

const tag = randomUUID().slice(0, 8);
const password = 'E2eWorkflow!2026';
const emailFor = (role) => `e2e-${role}-${tag}@example.test`;
const identities = {
  user: { email: emailFor('user'), name: `E2E User ${tag}` },
  organizer: { email: emailFor('organizer'), name: 'QA Organizer' },
  admin: { email: emailFor('admin'), name: 'QA Admin' }
};
const fixtures = { userIds: [], eventIds: [], bookingIds: [], activityAdminIds: [] };
let connection;
let categoryId;
let organizerId;
let adminId;
let userId;
let bookingEventId;
let pastEventId;
let pastBookingId;
let userState;
let organizerState;
let adminState;
let apiRequest;

const e2eRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDirectory = path.join(e2eRoot, 'screenshots');
const dbConfig = () => ({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'eventease_test'
});

test.beforeAll(async () => {
  assert.equal(process.env.DB_NAME, 'eventease_test', 'E2E must only use eventease_test.');
  connection = await mysql.createConnection(dbConfig());
  apiRequest = await request.newContext();

  const organizer = await registerThroughApi(apiRequest, identities.organizer.email, identities.organizer.name, password);
  organizerId = Number(organizer.id);
  fixtures.userIds.push(organizerId);
  await connection.execute("UPDATE users SET role = 'organizer', organization_name = 'EventEase E2E' WHERE id = ?", [organizerId]);

  const admin = await registerThroughApi(apiRequest, identities.admin.email, identities.admin.name, password);
  adminId = Number(admin.id);
  fixtures.userIds.push(adminId);
  await connection.execute("UPDATE users SET role = 'admin' WHERE id = ?", [adminId]);

  const [[category]] = await connection.execute("SELECT id FROM categories WHERE category_name = 'Tech' LIMIT 1");
  assert.ok(category, 'Seeded Tech category is required for E2E.');
  categoryId = Number(category.id);

  const [event] = await connection.execute(
    `INSERT INTO events
      (title, description, category_id, event_date, venue, city, banner_image, ticket_price, capacity, available_seats, organizer_id, status)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 DAY), ?, ?, ?, ?, ?, ?, ?, 'Approved')`,
    [`E2E Booking ${tag}`, 'A temporary event used by the EventEase browser workflow tests.', categoryId, 'E2E Hall', 'Bengaluru', 'https://example.test/e2e.png', 125, 5, 5, organizerId]
  );
  bookingEventId = Number(event.insertId);
  fixtures.eventIds.push(bookingEventId);
});

test.afterAll(async () => {
  if (!connection) return;
  try {
    await connection.beginTransaction();
    if (fixtures.userIds.length) {
      const marks = fixtures.userIds.map(() => '?').join(',');
      await connection.execute(`DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${marks}))`, fixtures.userIds);
      await connection.execute(`DELETE FROM bookings WHERE user_id IN (${marks})`, fixtures.userIds);
    }
    if (organizerId) {
      await connection.execute('DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE event_id IN (SELECT id FROM events WHERE organizer_id = ?))', [organizerId]);
      await connection.execute('DELETE FROM bookings WHERE event_id IN (SELECT id FROM events WHERE organizer_id = ?)', [organizerId]);
      await connection.execute('DELETE FROM events WHERE organizer_id = ?', [organizerId]);
    }
    if (fixtures.eventIds.length) {
      const marks = fixtures.eventIds.map(() => '?').join(',');
      await connection.execute(`DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE event_id IN (${marks}))`, fixtures.eventIds);
      await connection.execute(`DELETE FROM bookings WHERE event_id IN (${marks})`, fixtures.eventIds);
      await connection.execute(`DELETE FROM events WHERE id IN (${marks})`, fixtures.eventIds);
    }
    if (fixtures.userIds.length) {
      const marks = fixtures.userIds.map(() => '?').join(',');
      await connection.execute(`DELETE FROM activity_log WHERE admin_id IN (${marks})`, fixtures.userIds);
      await connection.execute(`DELETE FROM notifications WHERE user_id IN (${marks})`, fixtures.userIds);
      await connection.execute(`DELETE FROM organizer_requests WHERE user_id IN (${marks})`, fixtures.userIds);
      await connection.execute(`DELETE FROM users WHERE id IN (${marks})`, fixtures.userIds);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await apiRequest?.dispose();
    await connection.end();
  }
});

test('1. Register and log in with role-based redirects', async ({ browser }) => {
  const context = await makeContext(browser);
  const page = await context.newPage();
  identities.user.email = emailFor('registered');
  identities.user.name = `Registered E2E ${tag}`;

  await page.goto(`${SITE}/register.html`);
  await page.locator('#firstName').fill('Registered');
  await page.locator('#lastName').fill(`E2E ${tag}`);
  await page.locator('#registerEmail').fill(identities.user.email);
  await page.locator('#registerPassword').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByLabel('I agree to the Terms and Conditions').check();
  await page.locator('#registerForm button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard\.html$/);
  const user = await page.evaluate(async (api) => (await (await fetch(`${api}/auth/me`, { credentials: 'include' })).json()).data.user, API);
  userId = Number(user.id);
  fixtures.userIds.push(userId);
  userState = await context.storageState();

  await login(page, identities.organizer.email, password);
  await expect(page).toHaveURL(/organizer\.html#\/dashboard$/);
  organizerState = await context.storageState();

  await login(page, identities.admin.email, password);
  await expect(page).toHaveURL(/admin\.html#\/dashboard$/);
  adminState = await context.storageState();

  await login(page, identities.user.email, password);
  await expect(page).toHaveURL(/dashboard\.html$/);
  userState = await context.storageState();
  await context.close();
});

test('2. Guest login returns to the selected booking page', async ({ browser }) => {
  const context = await makeContext(browser);
  const page = await context.newPage();
  await page.goto(`${SITE}/book-event.html?event=${bookingEventId}`);
  await expect(page).toHaveURL(/login\.html\?returnTo=/);
  await page.waitForLoadState('networkidle');
  expect(new URL(page.url()).searchParams.get('returnTo')).toContain(`book-event.html?event=${bookingEventId}`);
  await page.locator('#loginEmail').fill(identities.user.email);
  await page.locator('#loginPassword').fill(password);
  expect(await page.locator('#loginForm').evaluate((form) => form.checkValidity())).toBe(true);
  const loginResponse = page.waitForResponse((response) => response.url().endsWith('/auth/login'));
  await page.locator('#loginForm button[type="submit"]').click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`book-event\\.html\\?event=${bookingEventId}$`));
  await expect(page.locator('.page-hero h1')).toContainText(`E2E Booking ${tag}`);
  userState = await context.storageState();
  await context.close();
});

test('3. Book, render/print QR, then cancel and verify inventory and ticket visibility', async ({ browser }) => {
  const context = await makeContext(browser, userState);
  const page = await context.newPage();
  await page.goto(`${SITE}/book-event.html?event=${bookingEventId}`);
  await expect(page.locator('#bookingForm')).toBeVisible();
  await page.locator('#ticketQty').fill('2');
  const before = (await eventFromApi(page, bookingEventId)).body.data.event;
  expect(Number(before.available_seats)).toBe(5);
  await page.locator('#bookingForm button[type="submit"]').click();
  await expect(page).toHaveURL(/booking-confirmation\.html\?booking=\d+/);
  const bookingId = Number(new URL(page.url()).searchParams.get('booking'));
  fixtures.bookingIds.push(bookingId);
  const [[booking]] = await connection.execute('SELECT ticket_id, quantity FROM bookings WHERE id = ?', [bookingId]);
  expect(Number(booking.quantity)).toBe(2);
  expect(Number((await eventFromApi(page, bookingEventId)).body.data.event.available_seats)).toBe(3);

  await page.goto(`${SITE}/my-tickets.html`);
  const ticketCard = page.locator('.ticket-card').filter({ hasText: booking.ticket_id });
  await expect(ticketCard).toBeVisible();
  const qr = ticketCard.locator('.qr-image');
  await expect(qr).toBeVisible();
  await expect.poll(() => qr.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  const tickets = await page.evaluate(async (api) => (await (await fetch(`${api}/tickets`, { credentials: 'include' })).json()).data.items, API);
  const ticket = tickets.find((item) => item.ticket_id === booking.ticket_id);
  expect(ticket).toBeTruthy();
  expect(ticket.qr_payload).toBe(JSON.stringify({ ticketId: booking.ticket_id, bookingId }));
  expect(qr).toHaveAttribute('src', ticket.qr_code_data_url);

  const png = PNG.sync.read(Buffer.from(ticket.qr_code_data_url.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded).toBeTruthy();
  assert.deepEqual(JSON.parse(decoded.data), { ticketId: booking.ticket_id, bookingId });

  await page.emulateMedia({ media: 'print' });
  await expect(qr).toBeVisible();
  await expect(ticketCard).toBeVisible();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('footer')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await ticketCard.getByRole('button', { name: 'Print' }).click();
  expect(await page.evaluate(() => window.__eventEasePrintCalls)).toBe(1);

  await page.goto(`${SITE}/my-bookings.html`);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(`[data-cancel-booking="${bookingId}"]`).click();
  await expect(page.locator('.booking-item').filter({ hasText: `Booking ID: ${bookingId}` })).toContainText('Cancelled');
  const [[cancelled]] = await connection.execute('SELECT booking_status FROM bookings WHERE id = ?', [bookingId]);
  expect(cancelled.booking_status).toBe('Cancelled');
  expect(Number((await eventFromApi(page, bookingEventId)).body.data.event.available_seats)).toBe(5);

  const [past] = await connection.execute(
    `INSERT INTO events
      (title, description, category_id, event_date, venue, city, banner_image, ticket_price, capacity, available_seats, organizer_id, status)
     VALUES (?, ?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY), ?, ?, ?, ?, ?, ?, ?, 'Approved')`,
    [`E2E Past ${tag}`, 'Past temporary event for QR visibility verification.', categoryId, 'Past Hall', 'Bengaluru', 'https://example.test/past.png', 50, 1, 0, organizerId]
  );
  pastEventId = Number(past.insertId);
  fixtures.eventIds.push(pastEventId);
  const [pastBooking] = await connection.execute(
    'INSERT INTO bookings (user_id, event_id, ticket_id, quantity, total_amount) VALUES (?, ?, ?, 1, 50)',
    [userId, pastEventId, `TK-P${tag.slice(0, 7).toUpperCase()}`]
  );
  pastBookingId = Number(pastBooking.insertId);
  fixtures.bookingIds.push(pastBookingId);
  await connection.execute("INSERT INTO payments (booking_id, amount, payment_status) VALUES (?, 50, 'Not Processed')", [pastBookingId]);

  await page.goto(`${SITE}/my-tickets.html`);
  await expect(page.locator('.ticket-card')).toHaveCount(0);
  const excludedIds = await page.evaluate(async (api) => (await (await fetch(`${api}/tickets`, { credentials: 'include' })).json()).data.items.map((item) => Number(item.booking_id)), API);
  expect(excludedIds).not.toContain(bookingId);
  expect(excludedIds).not.toContain(pastBookingId);

  const screenshotTicketId = `TK-${tag.toUpperCase()}`;
  const [screenshotBooking] = await connection.execute(
    'INSERT INTO bookings (user_id, event_id, ticket_id, quantity, total_amount) VALUES (?, ?, ?, 1, 125)',
    [userId, bookingEventId, screenshotTicketId]
  );
  fixtures.bookingIds.push(Number(screenshotBooking.insertId));
  await connection.execute("INSERT INTO payments (booking_id, amount, payment_status) VALUES (?, 125, 'Not Processed')", [screenshotBooking.insertId]);
  await connection.execute('UPDATE events SET available_seats = 4 WHERE id = ?', [bookingEventId]);
  await page.reload();
  await expect(page.locator('.ticket-card').filter({ hasText: screenshotTicketId })).toBeVisible();
  await context.close();
});

test('4. Organizer creates event; admin approves it and it becomes public', async ({ browser }) => {
  const context = await makeContext(browser, organizerState);
  const page = await context.newPage();
  await page.goto(`${SITE}/organizer.html#/events/new`);
  await page.locator('[name="title"]').fill(`E2E Approval ${tag}`);
  await page.locator('[name="categoryId"]').selectOption(String(categoryId));
  await page.locator('[name="description"]').fill('A temporary organizer event created and approved by the browser workflow.');
  const eventDate = new Date(Date.now() + 12 * 86400000);
  const localDate = new Date(eventDate.getTime() - eventDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.locator('[name="eventDate"]').fill(localDate);
  await page.locator('[name="venue"]').fill('Approval E2E Hall');
  await page.locator('[name="city"]').fill('Bengaluru');
  await page.locator('[name="bannerImage"]').fill('https://example.test/approval.png');
  await page.locator('[name="ticketPrice"]').fill('150');
  await page.locator('[name="capacity"]').fill('12');
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.locator('#panelContent')).toContainText(`E2E Approval ${tag}`);
  await expect(page.locator('#panelContent')).toContainText('Pending');
  const [[event]] = await connection.execute('SELECT id FROM events WHERE title = ? AND organizer_id = ?', [`E2E Approval ${tag}`, organizerId]);
  expect(event).toBeTruthy();
  const eventId = Number(event.id);
  fixtures.eventIds.push(eventId);
  await context.close();

  const adminContext = await makeContext(browser, adminState);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${SITE}/admin.html#/events`);
  const eventRow = adminPage.locator('tr').filter({ hasText: `E2E Approval ${tag}` });
  await expect(eventRow).toContainText('Pending');
  await eventRow.locator('button[data-panel-action="approve"]').click();
  await expect(eventRow).toContainText('Approved');
  expect((await eventFromApi(adminPage, eventId)).status).toBe(200);
  await adminPage.goto(`${SITE}/explore.html?q=${encodeURIComponent(`E2E Approval ${tag}`)}`);
  await expect(adminPage.locator('.events-grid')).toContainText(`E2E Approval ${tag}`);
  await adminContext.close();
});

test('5. Logged-out and wrong-role routes are denied or redirected', async ({ browser }) => {
  const guestContext = await makeContext(browser);
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`${SITE}/dashboard.html`);
  await expect(guestPage).toHaveURL(/login\.html\?returnTo=/);
  await guestPage.goto(`${SITE}/organizer.html#/dashboard`);
  await expect(guestPage.getByText('Sign in to continue')).toBeVisible();
  await guestPage.goto(`${SITE}/admin.html#/dashboard`);
  await expect(guestPage.getByText('Sign in to continue')).toBeVisible();
  await guestContext.close();

  const userContext = await makeContext(browser, userState);
  const userPage = await userContext.newPage();
  await userPage.goto(`${SITE}/admin.html#/dashboard`);
  await expect(userPage).toHaveURL(/dashboard\.html$/);
  const denied = await userPage.evaluate(async (api) => {
    const response = await fetch(`${api}/admin/dashboard`, { credentials: 'include' });
    return response.status;
  }, API);
  expect(denied).toBe(403);
  await userContext.close();

  const organizerContext = await makeContext(browser, organizerState);
  const organizerPage = await organizerContext.newPage();
  await organizerPage.goto(`${SITE}/admin.html#/dashboard`);
  await expect(organizerPage).toHaveURL(/organizer\.html#\/dashboard$/);
  await organizerContext.close();
});

test('Responsive pages: capture screenshots and check overflow, clipping, and mobile menus', async ({ browser }) => {
  await mkdir(screenshotDirectory, { recursive: true });
  const cases = [
    { name: 'index', path: '/index.html', role: null },
    { name: 'explore', path: '/explore.html', role: null },
    { name: 'event-details', path: `/event-details.html?event=${bookingEventId}`, role: null },
    { name: 'book-event', path: `/book-event.html?event=${bookingEventId}`, role: 'user' },
    { name: 'my-tickets', path: '/my-tickets.html', role: 'user' },
    { name: 'organizer', path: '/organizer.html#/dashboard', role: 'organizer' },
    { name: 'admin', path: '/admin.html#/events', role: 'admin' }
  ];
  const states = { user: userState, organizer: organizerState, admin: adminState };
  const issues = [];

  for (const width of [1366, 768, 390]) {
    for (const item of cases) {
      const context = await makeContext(browser, item.role ? states[item.role] : undefined);
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${SITE}${item.path}`);
      if (item.role === 'organizer' || item.role === 'admin') {
        await expect(page.locator('#panelContent h1')).toBeVisible();
      } else {
        await expect(page.locator('main h1').first()).toBeVisible();
      }

      const metrics = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const overflowText = [...document.querySelectorAll('h1,h2,h3,p,a,button,strong')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
              element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2;
          })
          .map((element) => element.textContent.trim().slice(0, 50));
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
          overflowText
        };
      });
      if (metrics.horizontalOverflow || metrics.overflowText.length) issues.push({ page: item.name, width, ...metrics });
      await page.screenshot({ path: path.join(screenshotDirectory, `${item.name}-${width}.png`), fullPage: true });

      if (width === 390 && item.role === 'organizer') {
        await page.getByRole('button', { name: 'Open navigation' }).click();
        await expect(page.locator('.org-sidebar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
        await expect(page.locator('.org-nav-link').first()).toBeVisible();
      } else if (width === 390 && item.role === 'admin') {
        const tableViewport = page.locator('.org-table-scroll').first();
        const tableMetrics = await tableViewport.evaluate((element) => ({
          overflowX: getComputedStyle(element).overflowX,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        }));
        expect(tableMetrics.overflowX).toMatch(/auto|scroll/);
        expect(tableMetrics.scrollWidth).toBeGreaterThan(tableMetrics.clientWidth);
        await page.getByRole('button', { name: 'Open navigation' }).click();
        await expect(page.locator('.org-nav-link').first()).toBeVisible();
      } else if (width === 390 && (item.name === 'index' || item.name === 'my-tickets')) {
        await page.getByRole('button', { name: 'Toggle menu' }).click();
        await expect(page.locator('.nav-links')).toBeVisible();
        await expect(page.locator('.nav-links a').first()).toBeVisible();
      }
      await context.close();
    }
  }
  console.log(`Responsive capture: 21 screenshots written to ${screenshotDirectory}`);
  console.log(`Responsive layout issues: ${JSON.stringify(issues)}`);
  expect(issues, 'Horizontal overflow or clipped text detected; inspect responsive screenshots.').toEqual([]);
});
