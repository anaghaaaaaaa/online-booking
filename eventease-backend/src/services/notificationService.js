import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { pageParams, pageResult } from '../utils/pagination.js';

export async function listNotifications(userId, query) {
  const { page, limit, offset } = pageParams(query);
  const [items] = await pool.execute('SELECT id, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);
  const [count] = await pool.execute('SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?', [userId]);
  return pageResult(items, count[0].total, page, limit);
}

export async function markRead(userId, id) {
  const [result] = await pool.execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [id, userId]);
  if (!result.affectedRows) throw new ApiError(404, 'Notification not found.');
  return { id: Number(id), is_read: true };
}

export async function markAllRead(userId) {
  const [result] = await pool.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [userId]);
  return { updated: result.affectedRows };
}
