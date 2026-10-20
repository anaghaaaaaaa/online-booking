import bcrypt from 'bcrypt';
import { pool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { pageParams, pageResult } from '../utils/pagination.js';

async function activity(connection, adminId, action, description) {
  await connection.execute('INSERT INTO activity_log (admin_id, action_type, description) VALUES (?, ?, ?)', [adminId, action, description]);
}

export async function dashboard() {
  const [[counts]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM users) AS total_users,
    (SELECT COUNT(*) FROM users WHERE role = 'organizer' AND status = 'Active') AS organizers,
    (SELECT COUNT(*) FROM events) AS events,
    (SELECT COUNT(*) FROM events WHERE status = 'Pending') AS pending_approvals,
    (SELECT COUNT(*) FROM bookings) AS bookings,
    (SELECT COUNT(*) FROM bookings WHERE booking_status = 'Cancelled') AS cancelled_bookings,
    (SELECT COALESCE(SUM(total_amount), 0) FROM bookings WHERE booking_status = 'Confirmed') AS revenue`);
  const [popularEvents] = await pool.execute("SELECT e.id, e.title, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.quantity ELSE 0 END), 0) AS tickets_sold FROM events e LEFT JOIN bookings b ON b.event_id = e.id GROUP BY e.id ORDER BY tickets_sold DESC LIMIT 5");
  const [recentBookings] = await pool.execute('SELECT b.id, b.ticket_id, b.quantity, b.total_amount, b.booking_status, b.created_at, u.name AS attendee_name, e.title AS event_title FROM bookings b JOIN users u ON u.id = b.user_id JOIN events e ON e.id = b.event_id ORDER BY b.created_at DESC LIMIT 8');
  const [recentActivity] = await pool.execute('SELECT a.id, a.action_type, a.description, a.created_at, u.name AS admin_name FROM activity_log a LEFT JOIN users u ON u.id = a.admin_id ORDER BY a.created_at DESC LIMIT 8');
  const [monthly] = await pool.execute("SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS bookings, COALESCE(SUM(total_amount), 0) AS revenue FROM bookings WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH) GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month");
  return { ...counts, popular_events: popularEvents, recent_bookings: recentBookings, recent_activity: recentActivity, bookings_per_month: monthly };
}

export async function listEvents(query) {
  const { page, limit, offset } = pageParams(query);
  const conditions = ['1 = 1'];
  const values = [];
  if (query.status) { conditions.push('e.status = ?'); values.push(query.status); }
  if (query.q) { conditions.push('(e.title LIKE ? OR e.city LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
  const where = conditions.join(' AND ');
  const [items] = await pool.execute(`SELECT e.*, c.category_name, u.name AS organizer_name, u.email AS organizer_email FROM events e JOIN categories c ON c.id = e.category_id JOIN users u ON u.id = e.organizer_id WHERE ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM events e WHERE ${where}`, values);
  return pageResult(items, counts[0].total, page, limit);
}

export async function reviewEvent(adminId, eventId, action, reason = '') {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT id, title, organizer_id, status FROM events WHERE id = ? FOR UPDATE', [eventId]);
    const event = rows[0];
    if (!event) throw new ApiError(404, 'Event not found.');
    if (action !== 'remove' && event.status !== 'Pending') throw new ApiError(409, 'Only pending events can be approved or rejected.');
    if (action === 'approve') {
      await connection.execute("UPDATE events SET status = 'Approved', rejection_reason = NULL, removed_reason = NULL, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?", [adminId, eventId]);
      await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [event.organizer_id, `Event “${event.title}” was approved and is now eligible for public listings.`]);
    } else if (action === 'reject') {
      await connection.execute("UPDATE events SET status = 'Rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?", [reason, adminId, eventId]);
      await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [event.organizer_id, `Event “${event.title}” was rejected. Reason: ${reason}`]);
    } else {
      const [attendees] = await connection.execute("SELECT DISTINCT user_id FROM bookings WHERE event_id = ? AND booking_status = 'Confirmed'", [eventId]);
      await connection.execute("UPDATE events SET status = 'Removed', removed_reason = ?, reviewed_by = ?, reviewed_at = NOW(), available_seats = capacity WHERE id = ?", [reason, adminId, eventId]);
      await connection.execute("UPDATE bookings SET booking_status = 'Cancelled', cancelled_at = NOW(), cancellation_reason = 'Event removed by administration' WHERE event_id = ? AND booking_status = 'Confirmed'", [eventId]);
      await connection.execute("UPDATE payments SET payment_status = CASE WHEN payment_status = 'Paid' THEN 'Refunded' ELSE payment_status END WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = ?)", [eventId]);
      await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [event.organizer_id, `Event “${event.title}” was removed. Reason: ${reason}`]);
      for (const attendee of attendees) await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [attendee.user_id, `Event “${event.title}” was removed. Your booking was cancelled.`]);
    }
    await activity(connection, adminId, `event_${action}`, `${action} event ${event.id}: ${event.title}`);
    return { id: Number(eventId), status: action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Removed' };
  });
}

export async function listUsers(query) {
  const { page, limit, offset } = pageParams(query);
  const conditions = ['1 = 1'];
  const values = [];
  if (query.role) { conditions.push('role = ?'); values.push(query.role); }
  if (query.status) { conditions.push('status = ?'); values.push(query.status); }
  if (query.q) { conditions.push('(name LIKE ? OR email LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
  const where = conditions.join(' AND ');
  const [items] = await pool.execute(`SELECT id, name, email, phone, role, status, organization_name, created_at FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, values);
  return pageResult(items, counts[0].total, page, limit);
}

export async function setUserStatus(adminId, userId, status) {
  if (Number(adminId) === Number(userId)) throw new ApiError(409, 'You cannot change your own account status.');
  return withTransaction(async (connection) => {
    await connection.execute("SELECT id FROM users WHERE role = 'admin' AND status = 'Active' FOR UPDATE");
    const [[user]] = await connection.execute('SELECT id, role, status FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw new ApiError(404, 'User not found.');
    if (user.role === 'admin' && status === 'Blocked') {
      const [[active]] = await connection.execute("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'Active' AND id <> ?", [userId]);
      if (!active.total) throw new ApiError(409, 'At least one active administrator must remain.');
    }
    await connection.execute('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    await activity(connection, adminId, 'user_status', `Changed user ${userId} status to ${status}`);
    return { id: Number(userId), status };
  });
}

export async function setUserRole(adminId, userId, role) {
  if (Number(adminId) === Number(userId)) throw new ApiError(409, 'You cannot change your own role.');
  return withTransaction(async (connection) => {
    const [[user]] = await connection.execute('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw new ApiError(404, 'User not found.');
    if (user.role === 'admin') throw new ApiError(409, 'Administrator accounts are read-only.');
    await connection.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    await activity(connection, adminId, 'user_role', `Changed user ${userId} role to ${role}`);
    return { id: Number(userId), role };
  });
}

export async function deleteUser(adminId, userId) {
  if (Number(adminId) === Number(userId)) throw new ApiError(409, 'You cannot delete your own account.');
  return withTransaction(async (connection) => {
    const [[user]] = await connection.execute('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw new ApiError(404, 'User not found.');
    if (user.role === 'admin') throw new ApiError(409, 'Administrator accounts are read-only.');
    const [[bookings]] = await connection.execute("SELECT COUNT(*) AS total FROM bookings WHERE user_id = ? AND booking_status = 'Confirmed'", [userId]);
    const [[events]] = await connection.execute('SELECT COUNT(*) AS total FROM events WHERE organizer_id = ?', [userId]);
    if (Number(bookings.total) || Number(events.total)) throw new ApiError(409, 'This account has bookings or events. Block it instead of deleting it.');
    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
    await activity(connection, adminId, 'user_delete', `Deleted user ${userId}`);
    return { id: Number(userId), deleted: true };
  });
}

export async function listOrganizerRequests(query) {
  const { page, limit, offset } = pageParams(query);
  const where = query.status ? 'WHERE r.status = ?' : '';
  const values = query.status ? [query.status] : [];
  const [items] = await pool.execute(`SELECT r.*, u.name, u.email, u.status AS user_status FROM organizer_requests r JOIN users u ON u.id = r.user_id ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM organizer_requests r ${where}`, values);
  return pageResult(items, counts[0].total, page, limit);
}

export async function reviewOrganizerRequest(adminId, requestId, action, note = '') {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT r.*, u.status AS user_status FROM organizer_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ? FOR UPDATE', [requestId]);
    const request = rows[0];
    if (!request) throw new ApiError(404, 'Organizer request not found.');
    if (request.status !== 'Pending') throw new ApiError(409, 'This organizer request has already been reviewed.');
    const status = action === 'approve' ? 'Approved' : 'Rejected';
    if (action === 'approve') {
      if (request.user_status !== 'Active') throw new ApiError(409, 'Blocked users cannot become organizers.');
      await connection.execute("UPDATE users SET role = 'organizer', organization_name = ? WHERE id = ?", [request.organization_name, request.user_id]);
    }
    await connection.execute('UPDATE organizer_requests SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', [status, note || null, adminId, requestId]);
    await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [request.user_id, action === 'approve' ? `Your organizer request was approved. You can now manage events for ${request.organization_name}.` : `Your organizer request was not approved. ${note}`]);
    await activity(connection, adminId, `organizer_request_${action}`, `${action} organizer request ${requestId}`);
    return { id: Number(requestId), status };
  });
}

export async function listBookings(query) {
  const { page, limit, offset } = pageParams(query);
  const conditions = ['1 = 1'];
  const values = [];
  if (query.status) { conditions.push('b.booking_status = ?'); values.push(query.status); }
  if (query.eventId) { conditions.push('e.id = ?'); values.push(query.eventId); }
  if (query.organizerId) { conditions.push('e.organizer_id = ?'); values.push(query.organizerId); }
  if (query.from) { conditions.push('b.created_at >= ?'); values.push(query.from); }
  if (query.to) { conditions.push('b.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); values.push(query.to); }
  if (query.q) { conditions.push('(u.name LIKE ? OR u.email LIKE ? OR b.ticket_id LIKE ?)'); values.push(...Array(3).fill(`%${query.q}%`)); }
  const where = conditions.join(' AND ');
  const [items] = await pool.execute(`SELECT b.id, b.ticket_id, b.quantity, b.total_amount, b.booking_status, b.cancelled_at, b.created_at, u.name AS attendee_name, u.email AS attendee_email, e.title AS event_title, e.event_date, o.name AS organizer_name, p.payment_status FROM bookings b JOIN users u ON u.id = b.user_id JOIN events e ON e.id = b.event_id JOIN users o ON o.id = e.organizer_id LEFT JOIN payments p ON p.booking_id = b.id WHERE ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM bookings b JOIN users u ON u.id = b.user_id JOIN events e ON e.id = b.event_id WHERE ${where}`, values);
  return pageResult(items, counts[0].total, page, limit);
}

export async function addCategory(adminId, name) {
  const [result] = await pool.execute('INSERT INTO categories (category_name) VALUES (?)', [name.trim()]);
  await pool.execute("INSERT INTO activity_log (admin_id, action_type, description) VALUES (?, 'category_create', ?)", [adminId, `Created category ${name}`]);
  return { id: result.insertId, category_name: name.trim() };
}

export async function updateCategory(adminId, id, name) {
  const [result] = await pool.execute('UPDATE categories SET category_name = ? WHERE id = ?', [name.trim(), id]);
  if (!result.affectedRows) throw new ApiError(404, 'Category not found.');
  await pool.execute("INSERT INTO activity_log (admin_id, action_type, description) VALUES (?, 'category_update', ?)", [adminId, `Updated category ${id} to ${name}`]);
  return { id: Number(id), category_name: name.trim() };
}

export async function deleteCategory(adminId, id) {
  const [[count]] = await pool.execute('SELECT COUNT(*) AS total FROM events WHERE category_id = ?', [id]);
  if (Number(count.total)) throw new ApiError(409, 'Categories with events cannot be deleted.');
  const [result] = await pool.execute('DELETE FROM categories WHERE id = ?', [id]);
  if (!result.affectedRows) throw new ApiError(404, 'Category not found.');
  await pool.execute("INSERT INTO activity_log (admin_id, action_type, description) VALUES (?, 'category_delete', ?)", [adminId, `Deleted category ${id}`]);
}

export async function listActivity(query) {
  const { page, limit, offset } = pageParams(query);
  const conditions = [];
  const values = [];
  if (query.type) { conditions.push('a.action_type = ?'); values.push(query.type); }
  if (query.from) { conditions.push('a.created_at >= ?'); values.push(query.from); }
  if (query.to) { conditions.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); values.push(query.to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [items] = await pool.execute(`SELECT a.*, u.name AS admin_name FROM activity_log a LEFT JOIN users u ON u.id = a.admin_id ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM activity_log a ${where}`, values);
  return pageResult(items, count.total, page, limit);
}

export async function adminReport(query = {}) {
  const clauses = [];
  const values = [];
  if (query.range === '7d') clauses.push('b.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
  else if (query.range === '30d') clauses.push('b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
  else if (query.range === '6m') clauses.push('b.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)');
  else if (query.range === 'custom' || query.from || query.to) {
    if (query.from) { clauses.push('b.created_at >= ?'); values.push(query.from); }
    if (query.to) { clauses.push('b.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); values.push(query.to); }
  }
  const bookingWhere = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const bookingOn = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  const [summary] = await pool.execute(`SELECT COUNT(*) AS bookings, COALESCE(SUM(CASE WHEN booking_status = 'Confirmed' THEN quantity ELSE 0 END), 0) AS tickets_sold, COALESCE(SUM(CASE WHEN booking_status = 'Confirmed' THEN total_amount ELSE 0 END), 0) AS revenue, SUM(booking_status = 'Cancelled') AS cancelled, SUM(booking_status = 'Confirmed') AS confirmed FROM bookings b ${bookingWhere}`, values);
  const [categories] = await pool.execute(`SELECT c.category_name, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.total_amount ELSE 0 END), 0) AS revenue FROM categories c LEFT JOIN events e ON e.category_id = c.id LEFT JOIN bookings b ON b.event_id = e.id${bookingOn} GROUP BY c.id ORDER BY revenue DESC`, values);
  const [topEvents] = await pool.execute(`SELECT e.id, e.title, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.quantity ELSE 0 END), 0) AS tickets_sold, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.total_amount ELSE 0 END), 0) AS revenue FROM events e LEFT JOIN bookings b ON b.event_id = e.id${bookingOn} GROUP BY e.id ORDER BY revenue DESC LIMIT 10`, values);
  const [growth] = await pool.query("SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS users FROM users WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH) GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month");
  const report = summary[0];
  return { ...report, cancellation_rate: report.bookings ? Number(report.cancelled || 0) / Number(report.bookings) * 100 : 0, average_tickets_per_booking: report.confirmed ? Number(report.tickets_sold) / Number(report.confirmed) : 0, revenue_by_category: categories, top_events: topEvents, user_growth_by_month: growth };
}
