import dotenv from 'dotenv';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const e2eRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(e2eRoot, '..');
const backendRoot = path.join(projectRoot, 'eventease-backend');
const testDatabase = 'eventease_test';
const pythonCommand = process.env.PYTHON || 'python';
const pythonArgs = [
  ...(path.basename(pythonCommand).toLowerCase().replace(/\.exe$/, '') === 'py' ? ['-3'] : []),
  '-m',
  'http.server',
  '8100',
  '--bind',
  '127.0.0.1',
  '--directory',
  projectRoot
];

if (process.env.DB_NAME && process.env.DB_NAME !== testDatabase) {
  throw new Error('E2E is restricted to eventease_test; refusing to run against another database.');
}
dotenv.config({ path: path.join(backendRoot, '.env') });
process.env.DB_NAME = testDatabase;
if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
  throw new Error('Set DB_USER and DB_PASSWORD in eventease-backend/.env before running E2E tests.');
}

const env = {
  ...process.env,
  DB_NAME: testDatabase,
  NODE_ENV: 'test',
  PORT: '5100',
  CLIENT_ORIGIN: 'http://localhost:8100',
  COOKIE_SECURE: 'false',
  JWT_SECRET: process.env.JWT_SECRET || 'e2e-only-secret-with-at-least-thirty-two-characters',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d'
};

const prep = spawnSync(process.execPath, ['prepare-db.js'], {
  cwd: e2eRoot,
  env,
  stdio: 'inherit'
});
if (prep.status !== 0) process.exit(prep.status || 1);

const api = spawn(process.execPath, ['src/server.js'], { cwd: backendRoot, env, stdio: 'inherit' });
const frontend = spawn(pythonCommand, pythonArgs, { cwd: projectRoot, env, stdio: 'inherit' });
const stop = (child) => {
  if (child.exitCode === null) child.kill();
};

async function waitFor(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local server exited before becoming ready: ${url}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for local server: ${url}`);
}

let result = 1;
try {
  await Promise.all([
    waitFor('http://localhost:5100/api/v1/events', api),
    waitFor('http://localhost:8100/index.html', frontend)
  ]);
  const cli = path.join(e2eRoot, 'node_modules', '@playwright', 'test', 'cli.js');
  const runner = spawnSync(process.execPath, [cli, 'test'], {
    cwd: e2eRoot,
    env: { ...env, EVENTEASE_API_URL: 'http://localhost:5100/api/v1' },
    stdio: 'inherit'
  });
  result = runner.status === null ? 1 : runner.status;
} finally {
  stop(frontend);
  stop(api);
}
process.exitCode = result;
