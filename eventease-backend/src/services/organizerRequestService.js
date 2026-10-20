import { withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

export async function createOrganizerRequest(userId, { organizationName, reason }) {
  return withTransaction(async (connection) => {
    const [users] = await connection.execute("SELECT id FROM users WHERE id = ? AND role = 'user' AND status = 'Active' FOR UPDATE", [userId]);
    if (!users.length) throw new ApiError(403, 'Only active user accounts can request organizer access.');
    const [existing] = await connection.execute("SELECT id FROM organizer_requests WHERE user_id = ? AND status = 'Pending' LIMIT 1", [userId]);
    if (existing.length) throw new ApiError(409, 'You already have a pending organizer request.');
    const [result] = await connection.execute('INSERT INTO organizer_requests (user_id, organization_name, reason) VALUES (?, ?, ?)', [userId, organizationName.trim(), reason.trim()]);
    return { id: result.insertId, status: 'Pending' };
  });
}
