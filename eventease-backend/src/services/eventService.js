import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { pageParams, pageResult } from '../utils/pagination.js';

const publicColumns = `e.id, e.title, e.description, e.event_date, e.venue, e.city, e.banner_image, e.ticket_price, e.capacity, e.available_seats, e.status, c.category_name, u.name AS organizer_name, u.email AS organizer_email`;

export async function listPublicEvents(query) {
  const { page, limit, offset } = pageParams(query);
  const conditions = ["e.status = 'Approved'", 'e.event_date > NOW()', "u.status = 'Active'"];
  const values = [];
  if (query.q) { conditions.push('(MATCH(e.title, e.description) AGAINST (? IN NATURAL LANGUAGE MODE) OR e.title LIKE ?)'); values.push(query.q, `%${query.q}%`); }
  if (query.location) { conditions.push('(e.city LIKE ? OR e.venue LIKE ?)'); values.push(`%${query.location}%`, `%${query.location}%`); }
  if (query.category) { conditions.push('c.category_name = ?'); values.push(query.category); }
  if (query.dateFrom) { conditions.push('e.event_date >= ?'); values.push(query.dateFrom); }
  if (query.dateTo) { conditions.push('e.event_date < DATE_ADD(?, INTERVAL 1 DAY)'); values.push(query.dateTo); }
  if (query.price === 'free') conditions.push('e.ticket_price = 0');
  if (query.price === 'lt50') conditions.push('e.ticket_price < 50');
  if (query.price === 'mid') conditions.push('e.ticket_price >= 50 AND e.ticket_price <= 100');
  if (query.price === 'gt100') conditions.push('e.ticket_price > 100');
  const where = conditions.join(' AND ');
  const order = query.sort === 'low' ? 'e.ticket_price ASC, e.event_date ASC' : query.sort === 'high' ? 'e.ticket_price DESC, e.event_date ASC' : 'e.event_date ASC';
  const [rows] = await pool.execute(`SELECT ${publicColumns} FROM events e JOIN categories c ON c.id = e.category_id JOIN users u ON u.id = e.organizer_id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM events e JOIN categories c ON c.id = e.category_id JOIN users u ON u.id = e.organizer_id WHERE ${where}`, values);
  return pageResult(rows, countRows[0].total, page, limit);
}

export async function getPublicEvent(id) {
  const [rows] = await pool.execute(`SELECT ${publicColumns} FROM events e JOIN categories c ON c.id = e.category_id JOIN users u ON u.id = e.organizer_id WHERE e.id = ? AND e.status = 'Approved' AND e.event_date > NOW() AND u.status = 'Active' LIMIT 1`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Event not found.');
  const event = rows[0];
  const [related] = await pool.execute(`SELECT ${publicColumns} FROM events e JOIN categories c ON c.id = e.category_id JOIN users u ON u.id = e.organizer_id WHERE e.id <> ? AND e.category_id = (SELECT category_id FROM events WHERE id = ?) AND e.status = 'Approved' AND e.event_date > NOW() AND u.status = 'Active' ORDER BY e.event_date LIMIT 3`, [id, id]);
  return { ...event, related_events: related };
}

export async function listCategories() {
  const [rows] = await pool.execute('SELECT id, category_name, created_at FROM categories ORDER BY category_name');
  return rows;
}
