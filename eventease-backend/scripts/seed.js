import bcrypt from 'bcrypt';
import { pool, withTransaction } from '../src/config/db.js';

const accounts = [
  { name: 'EventEase Admin', email: 'admin@eventease.com', password: 'Admin@123', role: 'admin', organization: null },
  { name: 'Avery Morgan', email: 'organizer@eventease.com', password: 'Organizer@123', role: 'organizer', organization: 'EventEase Studio' },
  { name: 'Priya Sharma', email: 'user@eventease.com', password: 'User@1234', role: 'user', organization: null }
];
const categoryNames = ['Music', 'Tech', 'Food & Drink', 'Arts', 'Sports', 'Business'];
const pictures = [
  'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80'
];
const eventSeeds = [
  { title: 'Future of AI Summit', category: 'Tech', city: 'Bengaluru', venue: 'Innovation Hall', price: 1499, capacity: 120, days: 20 },
  { title: 'Neon Nights Live', category: 'Music', city: 'Hyderabad', venue: 'Riverside Grounds', price: 2999, capacity: 240, days: 28 },
  { title: 'Culinary Mashup', category: 'Food & Drink', city: 'Mumbai', venue: 'Harbour Market', price: 699, capacity: 100, days: 35 },
  { title: 'Abstract Horizons', category: 'Arts', city: 'Delhi', venue: 'Gallery One', price: 1199, capacity: 80, days: 42 },
  { title: 'City Run Challenge', category: 'Sports', city: 'Mumbai', venue: 'Marine Drive', price: 499, capacity: 2, days: 49, soldOut: true },
  { title: 'Founders After Hours', category: 'Business', city: 'Pune', venue: 'Foundry Hall', price: 0, capacity: 150, days: 56 },
  { title: 'Creative Design Bootcamp', category: 'Arts', city: 'Pune', venue: 'Studio North', price: 899, capacity: 70, days: 63 },
  { title: 'Open-Air Community Festival', category: 'Music', city: 'Jaipur', venue: 'Central Gardens', price: 1299, capacity: 220, days: 70 }
];

const atHour = (days, hour = 18) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
};

try {
  const ids = {};
  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    await pool.execute(
      `INSERT INTO users (name, email, password_hash, role, status, organization_name)
       VALUES (?, ?, ?, ?, 'Active', ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = VALUES(role), status = 'Active', organization_name = VALUES(organization_name)`,
      [account.name, account.email, passwordHash, account.role, account.organization]
    );
    const [[row]] = await pool.execute('SELECT id FROM users WHERE email = ?', [account.email]);
    ids[account.role] = row.id;
  }

  const categoryIds = {};
  for (const name of categoryNames) {
    await pool.execute('INSERT INTO categories (category_name) VALUES (?) ON DUPLICATE KEY UPDATE category_name = VALUES(category_name)', [name]);
    const [[row]] = await pool.execute('SELECT id FROM categories WHERE category_name = ?', [name]);
    categoryIds[name] = row.id;
  }

  await withTransaction(async (connection) => {
    for (let index = 0; index < eventSeeds.length; index += 1) {
      const item = eventSeeds[index];
      const [[existing]] = await connection.execute('SELECT id FROM events WHERE title = ? AND organizer_id = ? LIMIT 1', [item.title, ids.organizer]);
      if (existing) continue;
      const start = atHour(item.days);
      const eventCapacity = item.capacity;
      const availableSeats = item.soldOut ? 0 : eventCapacity;
      const [insert] = await connection.execute(
        `INSERT INTO events (title, description, category_id, event_date, venue, city, banner_image, ticket_price, capacity, available_seats, organizer_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved')`,
        [item.title, `${item.title} brings attendees together for a welcoming, well-organized experience with a full schedule, accessible venue, and room to connect.`, categoryIds[item.category], start, item.venue, item.city, pictures[index], item.price, eventCapacity, availableSeats, ids.organizer]
      );
      if (item.soldOut) {
        const ticketId = `TK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        const quantity = eventCapacity;
        const total = item.price * quantity;
        const [booking] = await connection.execute('INSERT INTO bookings (user_id, event_id, ticket_id, quantity, total_amount) VALUES (?, ?, ?, ?, ?)', [ids.user, insert.insertId, ticketId, quantity, total]);
        await connection.execute("INSERT INTO payments (booking_id, amount, payment_status) VALUES (?, ?, 'Not Processed')", [booking.insertId, total]);
      }
    }
  });

  console.log('Seed complete. Demo accounts:');
  for (const account of accounts) console.log(`- ${account.role}: ${account.email} / ${account.password}`);
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
