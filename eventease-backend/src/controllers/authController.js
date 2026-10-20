import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import * as authService from '../services/authService.js';

const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE || env.NODE_ENV === 'production', path: '/', maxAge: 24 * 60 * 60 * 1000 });

export async function register(request, response) {
  const user = await authService.register(request.validated.body);
  const token = jwt.sign({}, env.JWT_SECRET, { subject: String(user.id), expiresIn: env.JWT_EXPIRES_IN });
  response.cookie('eventease_token', token, cookieOptions());
  response.status(201).json({ success: true, data: { user } });
}

export async function login(request, response) {
  const user = await authService.login(request.validated.body);
  const token = jwt.sign({}, env.JWT_SECRET, { subject: String(user.id), expiresIn: env.JWT_EXPIRES_IN });
  response.cookie('eventease_token', token, cookieOptions());
  response.json({ success: true, data: { user } });
}

export function logout(request, response) {
  response.clearCookie('eventease_token', { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE || env.NODE_ENV === 'production', path: '/' });
  response.json({ success: true, data: { loggedOut: true } });
}

export function me(request, response) {
  response.json({ success: true, data: { user: request.user } });
}

export async function updateProfile(request, response) {
  const user = await authService.updateProfile(request.user.id, request.validated.body);
  response.json({ success: true, data: { user } });
}

export async function updatePassword(request, response) {
  await authService.updatePassword(request.user.id, request.validated.body);
  response.json({ success: true, data: { updated: true } });
}
