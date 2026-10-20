import * as authService from '../services/authService.js';
import * as bookingService from '../services/bookingService.js';

export async function profile(request, response) {
  const user = await authService.updateProfile(request.user.id, request.validated.body);
  response.json({ success: true, data: { user } });
}
export async function password(request, response) {
  await authService.updatePassword(request.user.id, request.validated.body);
  response.json({ success: true, data: { updated: true } });
}
export async function dashboard(request, response) {
  response.json({ success: true, data: await bookingService.dashboardSummary(request.user.id) });
}
