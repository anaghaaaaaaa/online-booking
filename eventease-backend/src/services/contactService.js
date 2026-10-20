import { pool } from '../config/db.js';

export async function saveContactMessage({ name, email, message }) {
  const [result] = await pool.execute('INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)', [name.trim(), email.toLowerCase(), message.trim()]);
  return { id: result.insertId, received: true };
}
