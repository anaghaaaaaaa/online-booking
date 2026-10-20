import * as notificationService from '../services/notificationService.js';

export async function list(request, response) {
  const data = await notificationService.listNotifications(request.user.id, request.validated.query);
  response.json({ success: true, data });
}
export async function read(request, response) {
  const data = await notificationService.markRead(request.user.id, request.validated.params.id);
  response.json({ success: true, data });
}
export async function readAll(request, response) {
  const data = await notificationService.markAllRead(request.user.id);
  response.json({ success: true, data });
}
