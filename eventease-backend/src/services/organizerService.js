import { pool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { pageParams, pageResult } from '../utils/pagination.js';

const eventSelect = 'SELECT e.*, c.category_name FROM events e JOIN categories c ON c.id = e.category_id';
const inputColumns = ['title', 'description', 'eventDate', 'categoryId', 'venue', 'city', 'bannerImage', 'ticketPrice', 'capacity'];
const fieldMap = { title: 'title', description: 'description', eventDate: 'event_date', categoryId: 'category_id', venue: 'venue', city: 'city', bannerImage: 'banner_image', ticketPrice: 'ticket_price', capacity: 'capacity' };

export async function listEvents(organizerId, query) {
  const { page, limit, offset } = pageParams(query);
  const where = ['e.organizer_id = ?'];
  const values = [organizerId];
  if (query.status) { where.push('e.status = ?'); values.push(query.status); }
  if (query.categoryId) { where.push('e.category_id = ?'); values.push(query.categoryId); }
  if (query.q) { where.push('e.title LIKE ?'); values.push(`%${query.q}%`); }
  const clause = where.join(' AND ');
  const [items] = await pool.execute(`${eventSelect} WHERE ${clause} ORDER BY e.event_date LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM events e WHERE ${clause}`, values);
  return pageResult(items, counts[0].total, page, limit);
}

export async function getEvent(organizerId, eventId) {
  const [rows] = await pool.execute(`${eventSelect} WHERE e.id = ? AND e.organizer_id = ? LIMIT 1`, [eventId, organizerId]);
  if (!rows[0]) throw new ApiError(404, 'Event not found.');
  return rows[0];
}

export async function createEvent(organizerId, data) {
  const columns = ['title', 'description', 'category_id', 'event_date', 'venue', 'city', 'banner_image', 'ticket_price', 'capacity', 'available_seats', 'organizer_id', 'status'];
  const values = [data.title.trim(), data.description.trim(), data.categoryId, data.eventDate, data.venue.trim(), data.city.trim(), data.bannerImage, data.ticketPrice, data.capacity, data.capacity, organizerId, 'Pending'];
  const [result] = await pool.execute(`INSERT INTO events (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
  await pool.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [organizerId, `“${data.title}” was submitted for admin approval.`]);
  return getEvent(organizerId, result.insertId);
}

export async function updateEvent(organizerId, eventId, patch) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM events WHERE id = ? AND organizer_id = ? FOR UPDATE', [eventId, organizerId]);
    const event = rows[0];
    if (!event) throw new ApiError(404, 'Event not found.');
    if (['Cancelled', 'Removed'].includes(event.status) || new Date(event.event_date) <= new Date()) throw new ApiError(409, 'Cancelled, removed, or past events are read-only.');
    const [soldRows] = await connection.execute("SELECT COALESCE(SUM(quantity), 0) AS sold FROM bookings WHERE event_id = ? AND booking_status = 'Confirmed'", [eventId]);
    const sold = Number(soldRows[0].sold);
    const allowed = inputColumns.filter((field) => patch[field] !== undefined);
    const criticalChanged = ['title', 'ticketPrice', 'capacity'].some((field) => patch[field] !== undefined && NumberOrString(patch[field]) !== NumberOrString(event[fieldMap[field]])) || (patch.eventDate !== undefined && new Date(patch.eventDate).getTime() !== new Date(event.event_date).getTime());
    if (event.status === 'Approved' && sold > 0) {
      const forbidden = ['title', 'eventDate', 'ticketPrice', 'categoryId', 'city'].some((field) => patch[field] !== undefined);
      if (forbidden) throw new ApiError(409, 'With confirmed bookings, only description, banner image, venue, and increased capacity can be changed.');
      if (patch.capacity !== undefined && Number(patch.capacity) < sold) throw new ApiError(409, `Capacity cannot be lower than ${sold} tickets sold.`);
      if (patch.capacity !== undefined && Number(patch.capacity) < event.capacity) throw new ApiError(409, 'Capacity can only be increased after bookings are received.');
    }
    if (!allowed.length) return event;
    const assignments = allowed.map((field) => `${fieldMap[field]} = ?`);
    const values = allowed.map((field) => patch[field]);
    if (patch.capacity !== undefined) { assignments.push('available_seats = ?'); values.push(Number(patch.capacity) - sold); }
    if (event.status === 'Rejected') { assignments.push("status = 'Pending'", 'rejection_reason = NULL'); }
    else if (event.status === 'Approved' && sold === 0 && criticalChanged) assignments.push("status = 'Pending'", 'reviewed_at = NULL', 'reviewed_by = NULL');
    values.push(eventId, organizerId);
    await connection.execute(`UPDATE events SET ${assignments.join(', ')} WHERE id = ? AND organizer_id = ?`, values);
    if (event.status === 'Rejected' || (event.status === 'Approved' && sold === 0 && criticalChanged)) {
      await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [organizerId, `“${event.title}” was resubmitted for admin approval.`]);
    }
    const [updated] = await connection.execute(`${eventSelect} WHERE e.id = ? AND e.organizer_id = ?`, [eventId, organizerId]);
    return updated[0];
  });
}

export async function deleteEvent(organizerId, eventId) {
  return withTransaction(async (connection) => {
    const [events] = await connection.execute('SELECT id FROM events WHERE id = ? AND organizer_id = ? FOR UPDATE', [eventId, organizerId]);
    if (!events.length) throw new ApiError(404, 'Event not found.');
    const [bookings] = await connection.execute("SELECT COUNT(*) AS total FROM bookings WHERE event_id = ? AND booking_status = 'Confirmed'", [eventId]);
    if (Number(bookings[0].total) > 0) throw new ApiError(409, 'This event has confirmed bookings. Cancel it instead of deleting it.');
    await connection.execute('DELETE FROM events WHERE id = ? AND organizer_id = ?', [eventId, organizerId]);
  });
}

export async function cancelEvent(organizerId, eventId) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT id, title FROM events WHERE id = ? AND organizer_id = ? FOR UPDATE', [eventId, organizerId]);
    if (!rows[0]) throw new ApiError(404, 'Event not found.');
    const [attendees] = await connection.execute("SELECT DISTINCT user_id FROM bookings WHERE event_id = ? AND booking_status = 'Confirmed'", [eventId]);
    await connection.execute("UPDATE events SET status = 'Cancelled', available_seats = capacity WHERE id = ?", [eventId]);
    await connection.execute("UPDATE bookings SET booking_status = 'Cancelled', cancelled_at = NOW(), cancellation_reason = 'Event cancelled by organizer' WHERE event_id = ? AND booking_status = 'Confirmed'", [eventId]);
    await connection.execute("UPDATE payments SET payment_status = CASE WHEN payment_status = 'Paid' THEN 'Refunded' ELSE payment_status END WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = ?)", [eventId]);
    for (const attendee of attendees) await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [attendee.user_id, `Event “${rows[0].title}” was cancelled. Your booking was cancelled.`]);
    await connection.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [organizerId, `Event “${rows[0].title}” has been cancelled.`]);
    return { id: Number(eventId), status: 'Cancelled', notified_attendees: attendees.length };
  });
}

export async function listEventBookings(organizerId, eventId, query) {
  await getEvent(organizerId, eventId);
  const { page, limit, offset } = pageParams(query);
  const conditions = ['b.event_id = ?', 'e.organizer_id = ?'];
  const values = [eventId, organizerId];
  if (query.status) { conditions.push('b.booking_status = ?'); values.push(query.status); }
  if (query.q) { conditions.push('(u.name LIKE ? OR u.email LIKE ? OR b.ticket_id LIKE ? OR CAST(b.id AS CHAR) LIKE ?)'); values.push(...Array(4).fill(`%${query.q}%`)); }
  const where = conditions.join(' AND ');
  const [items] = await pool.execute(`SELECT b.id AS booking_id, b.ticket_id, u.name AS attendee_name, u.email AS attendee_email, b.quantity, b.total_amount, b.booking_status, b.created_at, b.cancelled_at FROM bookings b JOIN events e ON e.id = b.event_id JOIN users u ON u.id = b.user_id WHERE ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM bookings b JOIN events e ON e.id = b.event_id JOIN users u ON u.id = b.user_id WHERE ${where}`, values);
  return pageResult(items, counts[0].total, page, limit);
}

export async function listBookings(organizerId, query) {
  const { page, limit, offset } = pageParams(query);
  const conditions = ['e.organizer_id = ?'];
  const values = [organizerId];
  if (query.eventId) { conditions.push('e.id = ?'); values.push(query.eventId); }
  if (query.status) { conditions.push('b.booking_status = ?'); values.push(query.status); }
  if (query.from) { conditions.push('b.created_at >= ?'); values.push(query.from); }
  if (query.to) { conditions.push('b.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); values.push(query.to); }
  if (query.q) { conditions.push('(u.name LIKE ? OR u.email LIKE ? OR b.ticket_id LIKE ?)'); values.push(...Array(3).fill(`%${query.q}%`)); }
  const where = conditions.join(' AND ');
  const [items] = await pool.execute(`SELECT b.id AS booking_id, b.ticket_id, b.quantity, b.total_amount, b.booking_status, b.cancelled_at, b.created_at, u.name AS attendee_name, u.email AS attendee_email, e.id AS event_id, e.title AS event_title, e.event_date FROM bookings b JOIN events e ON e.id = b.event_id JOIN users u ON u.id = b.user_id WHERE ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total, SUM(b.booking_status = 'Confirmed') AS confirmed, SUM(b.booking_status = 'Cancelled') AS cancelled, SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.total_amount ELSE 0 END) AS revenue FROM bookings b JOIN events e ON e.id = b.event_id JOIN users u ON u.id = b.user_id WHERE ${where}`, values);
  return { ...pageResult(items, counts[0].total, page, limit), summary: counts[0] };
}

export async function dashboard(organizerId) {
  const [stats] = await pool.execute(`SELECT (SELECT COUNT(*) FROM events WHERE organizer_id = ?) AS total_events, (SELECT COUNT(*) FROM bookings b JOIN events e ON e.id = b.event_id WHERE e.organizer_id = ?) AS total_bookings, (SELECT COALESCE(SUM(b.quantity), 0) FROM bookings b JOIN events e ON e.id = b.event_id WHERE e.organizer_id = ? AND b.booking_status = 'Confirmed') AS tickets_sold, (SELECT COALESCE(SUM(b.total_amount), 0) FROM bookings b JOIN events e ON e.id = b.event_id WHERE e.organizer_id = ? AND b.booking_status = 'Confirmed') AS revenue, (SELECT COALESCE(SUM(available_seats), 0) FROM events WHERE organizer_id = ?) AS available_seats, (SELECT COUNT(*) FROM events WHERE organizer_id = ? AND status = 'Pending') AS pending_approval, (SELECT COUNT(*) FROM events WHERE organizer_id = ? AND status = 'Approved') AS approved_events, (SELECT COUNT(*) FROM events WHERE organizer_id = ? AND status = 'Rejected') AS rejected_events`, Array(8).fill(organizerId));
  const [upcoming] = await pool.execute("SELECT e.id, e.title, e.event_date, e.capacity, e.available_seats, e.status, c.category_name, e.city FROM events e JOIN categories c ON c.id = e.category_id WHERE e.organizer_id = ? AND e.event_date > NOW() ORDER BY e.event_date LIMIT 5", [organizerId]);
  const [recent] = await pool.execute('SELECT b.id, b.ticket_id, b.quantity, b.total_amount, b.booking_status, b.created_at, u.name AS attendee_name, u.email, e.title AS event_title FROM bookings b JOIN events e ON e.id = b.event_id JOIN users u ON u.id = b.user_id WHERE e.organizer_id = ? ORDER BY b.created_at DESC LIMIT 5', [organizerId]);
  return { ...stats[0], upcoming, recent };
}

export async function reports(organizerId, eventId) {
  const eventCondition = eventId ? ' AND e.id = ?' : '';
  const values = eventId ? [organizerId, eventId] : [organizerId];
  const [summary] = await pool.execute(`SELECT (SELECT COALESCE(SUM(e.capacity), 0) FROM events e WHERE e.organizer_id = ?${eventId ? ' AND e.id = ?' : ''}) AS capacity, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.quantity ELSE 0 END), 0) AS tickets_sold, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.total_amount ELSE 0 END), 0) AS revenue, SUM(b.booking_status = 'Cancelled') AS cancelled_bookings, COUNT(b.id) AS total_bookings FROM events e LEFT JOIN bookings b ON b.event_id = e.id WHERE e.organizer_id = ?${eventCondition}`, [...values, ...values]);
  const [perEvent] = await pool.execute(`SELECT e.id, e.title, e.capacity, e.available_seats, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.quantity ELSE 0 END), 0) AS tickets_sold, SUM(b.booking_status = 'Cancelled') AS cancelled_bookings, COALESCE(SUM(CASE WHEN b.booking_status = 'Confirmed' THEN b.total_amount ELSE 0 END), 0) AS revenue FROM events e LEFT JOIN bookings b ON b.event_id = e.id WHERE e.organizer_id = ?${eventCondition} GROUP BY e.id ORDER BY e.event_date`, values);
  const row = summary[0];
  return { tickets_sold: Number(row.tickets_sold), revenue: Number(row.revenue), occupancy_rate: row.capacity ? Number(row.tickets_sold) / Number(row.capacity) * 100 : 0, cancellation_rate: row.total_bookings ? Number(row.cancelled_bookings || 0) / Number(row.total_bookings) * 100 : 0, bookings_per_event: perEvent.map((item) => ({ ...item, available_seats: Number(item.available_seats), booking_count: Number(item.tickets_sold) + Number(item.cancelled_bookings || 0) })), events: perEvent };
}

function NumberOrString(value) {
  return typeof value === 'number' || !Number.isNaN(Number(value)) ? Number(value) : String(value);
}
