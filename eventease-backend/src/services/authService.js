import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, status: user.status, organization_name: user.organization_name, bio: user.bio });

export async function register({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, \'user\')',
    [name.trim(), email.toLowerCase(), passwordHash]
  );
  const [rows] = await pool.execute('SELECT id, name, email, phone, role, status, organization_name, bio FROM users WHERE id = ?', [result.insertId]);
  return publicUser(rows[0]);
}

export async function login({ email, password }) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new ApiError(401, 'Invalid email or password.');
  if (user.status !== 'Active') throw new ApiError(403, 'Your account has been blocked.');
  return publicUser(user);
}

export async function updateProfile(userId, patch) {
  const allowed = ['name', 'phone', 'organization_name', 'bio'];
  const values = allowed.filter((key) => patch[key] !== undefined);
  if (!values.length) throw new ApiError(422, 'No profile fields were provided.');
  const assignments = values.map((key) => `${key} = ?`).join(', ');
  await pool.execute(`UPDATE users SET ${assignments} WHERE id = ?`, [...values.map((key) => patch[key]), userId]);
  const [rows] = await pool.execute('SELECT id, name, email, phone, role, status, organization_name, bio FROM users WHERE id = ?', [userId]);
  return publicUser(rows[0]);
}

export async function updatePassword(userId, { currentPassword, newPassword }) {
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) throw new ApiError(422, 'Current password is incorrect.');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

export { publicUser };
