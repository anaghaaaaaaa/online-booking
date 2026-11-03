import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.join(root, 'eventease-backend');
const testDatabase = 'eventease_test';

if (process.env.DB_NAME && process.env.DB_NAME !== testDatabase) {
  throw new Error('E2E is restricted to eventease_test; DB_NAME must not target another database.');
}
if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
  throw new Error('Set DB_USER and DB_PASSWORD in eventease-backend/.env before running E2E tests.');
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  multipleStatements: true
});

try {
  const schema = await readFile(path.join(backendRoot, 'sql', 'schema.sql'), 'utf8');
  const statements = schema.replace(/^\s*CREATE DATABASE IF NOT EXISTS eventease[^;]*;\s*USE eventease;\s*/i, '');
  assert.notEqual(statements, schema, 'The schema database selector must be removed before test setup.');
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${testDatabase} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await connection.query(`USE ${testDatabase}`);
  await connection.query(statements);
} finally {
  await connection.end();
}

try {
  execFileSync(process.execPath, ['scripts/seed.js'], {
    cwd: backendRoot,
    env: { ...process.env, DB_NAME: testDatabase },
    stdio: 'ignore'
  });
} catch {
  throw new Error('Could not seed eventease_test. Check the backend seed script and test database connection.');
}
