import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const auth = asyncHandler(async (request, response, next) => {
  const token = request.cookies?.eventease_token;
  if (!token) throw new ApiError(401, 'Authentication required.');
  let claims;
  try {
    claims = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Session is invalid or expired.');
  }
  const [users] = await pool.execute(
    'SELECT id, name, email, role, status FROM users WHERE id = ? LIMIT 1',
    [claims.sub]
  );
  const user = users[0];
  if (!user) throw new ApiError(401, 'Account no longer exists.');
  if (user.status !== 'Active') throw new ApiError(403, 'Your account has been blocked.');
  request.user = user;
  next();
});
