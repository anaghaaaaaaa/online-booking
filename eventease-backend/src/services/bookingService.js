import { withTransaction, pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { createTicketId } from '../utils/ticketId.js';
import { pageParams, pageResult } from '../utils/pagination.js';
import QRCode from 'qrcode';

export async function createBooking(user, { eventId, quantity }) {
  if (user.role !== 'user') throw new ApiError(403, 'Only registered users can book events.');
  return withTransaction(async (connection) => {
    const [events] = await connection.execute('SELECT * FROM events WHERE id = ? FOR UPDATE', [eventId]);
    const event = events[0];
    if (!event || event.status !== 'Approved' || new Date(event.event_date) <= new Date()) throw new ApiError(404, 'Approved upcoming event not found.');
    if (Number(event.organizer_id) === Number(user.id)) throw new ApiError(403, 'You cannot book your own event.');
    const [organizers] = await connection.execute("SELECT status FROM users WHERE id = ? AND role = 'organizer'", [event.organizer_id]);
    if (!organizers[0] || organizers[0].status !== 'Active') throw new ApiError(409, 'This event is not currently available.');
    if (event.available_seats < quantity) throw new ApiError(409, event.available_seats ? `Only ${event.available_seats} seat(s) left.` : 'Sold out.');
    const [duplicate] = await connection.execute('SELECT id FROM bookings WHERE user_id = ? AND event_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 10 SECOND) LIMIT 1', [user.id, eventId]);
    if (duplicate.length) throw new ApiError(409, 'A recent booking for this event is already being processed.');
    const ticketId = await uniqueTicketId(connection);
    const total = Number(event.ticket_price) * quantity;
    const [result] = await connection.execute('INSERT INTO bookings (user_id, event_id, ticket_id, quantity, total_amount) VALUES (?, ?, ?, ?, ?)', [user.id, eventId, ticketId, quantity, total]);
    await connection.execute('UPDATE events SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?', [quantity, eventId, quantity]);
    await connection.execute("INSERT INTO payments (booking_id, amount, payment_status) VALUES (?, ?, 'Not Processed')", [result.insertId, total]);
    await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [user.id, `Booking ${ticketId} is confirmed. No payment was processed.`]);
    await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [event.organizer_id, `New booking: ${quantity} ticket(s) for “${event.title}”.`]);
    return { id: result.insertId, ticket_id: ticketId, event_id: event.id, quantity, total_amount: total, booking_status: 'Confirmed', payment_status: 'Not Processed' };
  });
}

async function uniqueTicketId(connection) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = createTicketId();
    const [rows] = await connection.execute('SELECT id FROM bookings WHERE ticket_id = ? LIMIT 1', [id]);
    if (!rows.length) return id;
  }
  throw new ApiError(500, 'Could not generate a unique ticket identifier.');
}

export async function listUserBookings(userId, query) {
  const { page, limit, offset } = pageParams(query);
  const conditions = ['b.user_id = ?'];
  const values = [userId];
  if (query.status === 'Completed') conditions.push("b.booking_status = 'Confirmed' AND e.event_date <= NOW()");
  else if (query.status) { conditions.push('b.booking_status = ?'); values.push(query.status); }
  if (query.q) { conditions.push('(e.title LIKE ? OR b.ticket_id LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
  const where = conditions.join(' AND ');
  const [rows] = await pool.execute(`SELECT b.id, b.ticket_id, b.quantity, b.total_amount, b.booking_status, b.cancelled_at, b.created_at, e.id AS event_id, e.title, e.event_date, e.venue, e.city, CASE WHEN b.booking_status = 'Cancelled' THEN 'Cancelled' WHEN e.event_date <= NOW() THEN 'Completed' ELSE 'Confirmed' END AS derived_status FROM bookings b JOIN events e ON e.id = b.event_id WHERE ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM bookings b JOIN events e ON e.id = b.event_id WHERE ${where}`, values);
  return pageResult(rows, counts[0].total, page, limit);
}

export async function getUserBooking(userId, bookingId) {
  const [rows] = await pool.execute('SELECT b.*, e.title, e.event_date, e.venue, e.city, p.payment_status FROM bookings b JOIN events e ON e.id = b.event_id LEFT JOIN payments p ON p.booking_id = b.id WHERE b.id = ? AND b.user_id = ? LIMIT 1', [bookingId, userId]);
  if (!rows[0]) throw new ApiError(404, 'Booking not found.');
  return rows[0];
}

export async function cancelUserBooking(userId, bookingId, reason = '') {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT b.*, e.event_date, e.capacity, e.available_seats FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = ? AND b.user_id = ? FOR UPDATE', [bookingId, userId]);
    const booking = rows[0];
    if (!booking) throw new ApiError(404, 'Booking not found.');
    if (booking.booking_status !== 'Confirmed') throw new ApiError(409, 'Only confirmed bookings can be cancelled.');
    if (new Date(booking.event_date).getTime() - Date.now() <= 24 * 60 * 60 * 1000) throw new ApiError(409, 'Bookings can only be cancelled more than 24 hours before the event.');
    await connection.execute("UPDATE bookings SET booking_status = 'Cancelled', cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?", [reason || null, bookingId]);
    await connection.execute('UPDATE events SET available_seats = LEAST(capacity, available_seats + ?) WHERE id = ?', [booking.quantity, booking.event_id]);
    await connection.execute("UPDATE payments SET payment_status = CASE WHEN payment_status = 'Paid' THEN 'Refunded' ELSE payment_status END WHERE booking_id = ?", [bookingId]);
    await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [userId, `Booking ${booking.ticket_id} has been cancelled.`]);
    await connection.execute('INSERT INTO notifications (user_id, message) SELECT organizer_id, ? FROM events WHERE id = ?', [`A booking for event ${bookingId} was cancelled.`, booking.event_id]);
    return { id: Number(bookingId), booking_status: 'Cancelled', cancelled_at: new Date().toISOString() };
  });
}

export async function listTickets(userId) {
  const [rows] = await pool.execute("SELECT b.ticket_id, b.id AS booking_id, e.title, e.event_date, e.venue, e.city, b.quantity, u.name AS attendee_name FROM bookings b JOIN events e ON e.id = b.event_id JOIN users u ON u.id = b.user_id WHERE b.user_id = ? AND b.booking_status = 'Confirmed' AND e.event_date > NOW() ORDER BY e.event_date", [userId]);
  return Promise.all(rows.map(async (ticket) => {
    const qrPayload = JSON.stringify({ ticketId: ticket.ticket_id, bookingId: Number(ticket.booking_id) });
    return {
      ...ticket,
      qr_payload: qrPayload,
      qr_code_data_url: await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M' })
    };
  }));
}

export async function dashboardSummary(userId) {
  const [counts] = await pool.execute("SELECT COUNT(*) AS total, SUM(b.booking_status = 'Cancelled') AS cancelled, SUM(b.booking_status = 'Confirmed' AND e.event_date > NOW()) AS upcoming, SUM(b.booking_status = 'Confirmed' AND e.event_date <= NOW()) AS completed FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.user_id = ?", [userId]);
  const [upcoming] = await pool.execute("SELECT b.id, b.ticket_id, b.quantity, e.title, e.event_date, e.venue, e.city FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.user_id = ? AND b.booking_status = 'Confirmed' AND e.event_date > NOW() ORDER BY e.event_date LIMIT 5", [userId]);
  const [recent] = await pool.execute('SELECT id, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]);
  return { ...counts[0], upcoming, recent };
}
