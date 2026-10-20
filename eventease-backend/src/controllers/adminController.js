import * as adminService from '../services/adminService.js';
import { sendCsv, toCsv } from '../utils/csv.js';
import { pool } from '../config/db.js';

export async function dashboard(request, response) { response.json({ success: true, data: await adminService.dashboard() }); }
export async function events(request, response) { response.json({ success: true, data: await adminService.listEvents(request.validated.query) }); }
export async function pendingEvents(request, response) { response.json({ success: true, data: await adminService.listEvents({ status: 'Pending', page: 1, limit: 50 }) }); }
export async function approveEvent(request, response) { response.json({ success: true, data: await adminService.reviewEvent(request.user.id, request.validated.params.id, 'approve') }); }
export async function rejectEvent(request, response) { response.json({ success: true, data: await adminService.reviewEvent(request.user.id, request.validated.params.id, 'reject', request.validated.body.reason) }); }
export async function removeEvent(request, response) { response.json({ success: true, data: await adminService.reviewEvent(request.user.id, request.validated.params.id, 'remove', request.validated.body.reason) }); }
export async function users(request, response) { response.json({ success: true, data: await adminService.listUsers(request.validated.query) }); }
export async function userStatus(request, response) { response.json({ success: true, data: await adminService.setUserStatus(request.user.id, request.validated.params.id, request.validated.body.status) }); }
export async function userRole(request, response) { response.json({ success: true, data: await adminService.setUserRole(request.user.id, request.validated.params.id, request.validated.body.role) }); }
export async function deleteUser(request, response) { response.json({ success: true, data: await adminService.deleteUser(request.user.id, request.validated.params.id) }); }
export async function organizerRequests(request, response) { response.json({ success: true, data: await adminService.listOrganizerRequests(request.validated.query) }); }
export async function approveOrganizerRequest(request, response) { response.json({ success: true, data: await adminService.reviewOrganizerRequest(request.user.id, request.validated.params.id, 'approve') }); }
export async function rejectOrganizerRequest(request, response) { response.json({ success: true, data: await adminService.reviewOrganizerRequest(request.user.id, request.validated.params.id, 'reject', request.validated.body.note || '') }); }
export async function bookings(request, response) { response.json({ success: true, data: await adminService.listBookings(request.validated.query) }); }
export async function exportBookings(request, response) {
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await adminService.listBookings({ ...request.validated.query, page, limit: 50 });
    all.push(...data.items);
    pages = data.pages;
    page += 1;
  } while (page <= pages);
  const rows = all.map((item) => [item.id, item.ticket_id, item.attendee_name, item.attendee_email, item.event_title, item.organizer_name, item.quantity, item.total_amount, item.booking_status, item.cancelled_at, item.created_at]);
  sendCsv(response, 'admin-bookings.csv', toCsv(['Booking ID', 'Ticket ID', 'Attendee', 'Email', 'Event', 'Organizer', 'Quantity', 'Amount', 'Status', 'Cancelled At', 'Booked At'], rows));
}
export async function categories(request, response) {
  const [items] = await pool.execute('SELECT id, category_name, created_at FROM categories ORDER BY category_name');
  response.json({ success: true, data: { items } });
}
export async function createCategory(request, response) { response.status(201).json({ success: true, data: await adminService.addCategory(request.user.id, request.validated.body.categoryName) }); }
export async function updateCategory(request, response) { response.json({ success: true, data: await adminService.updateCategory(request.user.id, request.validated.params.id, request.validated.body.categoryName) }); }
export async function deleteCategory(request, response) { await adminService.deleteCategory(request.user.id, request.validated.params.id); response.json({ success: true, data: { deleted: true } }); }
export async function reports(request, response) { response.json({ success: true, data: await adminService.adminReport(request.validated.query) }); }
export async function exportReports(request, response) {
  const report = await adminService.adminReport(request.validated.query);
  const rows = report.top_events.map((event) => [event.title, event.tickets_sold, event.revenue]);
  sendCsv(response, 'eventease-report.csv', toCsv(['Event', 'Tickets Sold', 'Revenue'], rows));
}
export async function activity(request, response) { response.json({ success: true, data: await adminService.listActivity(request.validated.query) }); }
