import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';

const server = app.listen(env.PORT, async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`EventEase API listening on http://localhost:${env.PORT}`);
  } catch (error) {
    console.error('Database connection failed during startup:', error.message);
    server.close(() => process.exit(1));
  }
});

async function shutdown(signal) {
  console.log(`${signal} received; closing API server.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
