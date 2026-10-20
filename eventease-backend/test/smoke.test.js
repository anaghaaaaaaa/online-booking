import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV ||= 'test';
process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ??= '';
process.env.DB_NAME ||= 'eventease_test';
process.env.JWT_SECRET ||= 'test-only-secret-with-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN ||= '1d';
process.env.CLIENT_ORIGIN ||= 'http://localhost:8000';
process.env.COOKIE_SECURE ||= 'false';
process.env.PORT ||= '5000';

const [{ app }, { createTicketId }, { toCsv }, { pageParams, pageResult }] = await Promise.all([
  import('../src/app.js'),
  import('../src/utils/ticketId.js'),
  import('../src/utils/csv.js'),
  import('../src/utils/pagination.js')
]);

test('health route returns a success envelope without a database request', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, data: { status: 'ok' } });
});

test('protected routes reject missing cookies before touching the database', async () => {
  const response = await request(app).get('/api/v1/auth/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('registration validation rejects invalid email before database access', async () => {
  const response = await request(app).post('/api/v1/auth/register').send({ name: 'Test User', email: 'bad', password: 'password123' });
  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
});

test('ticket IDs follow the unique ticket format', () => {
  assert.match(createTicketId(), /^TK-[A-F0-9]{8}$/);
});

test('CSV escapes quotes and line breaks safely', () => {
  assert.equal(toCsv(['Name', 'Note'], [['Ava', 'said "hello"']]), '"Name","Note"\r\n"Ava","said ""hello"""');
});

test('pagination clamps limits to the API maximum', () => {
  assert.deepEqual(pageParams({ page: '-2', limit: '500' }), { page: 1, limit: 50, offset: 0 });
  assert.deepEqual(pageResult([1, 2], 101, 2, 50), { items: [1, 2], total: 101, page: 2, pages: 3 });
});
