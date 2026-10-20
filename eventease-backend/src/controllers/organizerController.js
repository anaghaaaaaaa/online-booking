import * as organizerService from '../services/organizerService.js';
import * as requestService from '../services/organizerRequestService.js';
import { toCsv, sendCsv } from '../utils/csv.js';

export async function dashboard(request, response) {
  response.json({ success: true, data: await organizerService.dashboard(request.user.id) });
}
export async function listEvents(request, response) {
  response.json({ success: true, data: await organizerService.listEvents(request.user.id, request.validated.query) });
}
export async function getEvent(request, response) {
  response.json({ success: true, data: { event: await organizerService.getEvent(request.user.id, request.validated.params.id) } });
}
export async function createEvent(request, response) {
  const event = await organizerService.createEvent(request.user.id, request.validated.body);
  response.status(201).json({ success: true, data: { event } });
}
export async function updateEvent(request, response) {
  const event = await organizerService.updateEvent(request.user.id, request.validated.params.id, request.validated.body);
  response.json({ success: true, data: { event } });
}
export async function deleteEvent(request, response) {
  await organizerService.deleteEvent(request.user.id, request.validated.params.id);
  response.json({ success: true, data: { deleted: true } });
}
export async function cancelEvent(request, response) {
  response.json({ success: true, data: await organizerService.cancelEvent(request.user.id, request.validated.params.id) });
}
export async function eventBookings(request, response) {
  response.json({ success: true, data: await organizerService.listEventBookings(request.user.id, request.validated.params.id, request.validated.query) });
}
export async function exportEventBookings(request, response) {
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await organizerService.listEventBookings(request.user.id, request.validated.params.id, { ...request.validated.query, page, limit: 50 });
    all.push(...data.items);
    pages = data.pages;
    page += 1;
  } while (page <= pages);
  const rows = all.map((item) => [item.booking_id, item.ticket_id, item.attendee_name, item.attendee_email, item.quantity, item.total_amount, item.booking_status, item.created_at, item.cancelled_at]);
  sendCsv(response, `event-${request.validated.params.id}-attendees.csv`, toCsv(['Booking ID', 'Ticket ID', 'Attendee', 'Email', 'Quantity', 'Amount', 'Status', 'Booked At', 'Cancelled At'], rows));
}
export async function allBookings(request, response) {
  response.json({ success: true, data: await organizerService.listBookings(request.user.id, request.validated.query) });
}
export async function exportBookings(request, response) {
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await organizerService.listBookings(request.user.id, { ...request.validated.query, page, limit: 50 });
    all.push(...data.items);
    pages = data.pages;
    page += 1;
  } while (page <= pages);
  const rows = all.map((item) => [item.booking_id, item.ticket_id, item.attendee_name, item.attendee_email, item.event_title, item.quantity, item.total_amount, item.booking_status, item.created_at, item.cancelled_at]);
  sendCsv(response, 'organizer-bookings.csv', toCsv(['Booking ID', 'Ticket ID', 'Attendee', 'Email', 'Event', 'Quantity', 'Amount', 'Status', 'Booked At', 'Cancelled At'], rows));
}
export async function reports(request, response) {
  response.json({ success: true, data: await organizerService.reports(request.user.id, request.validated.query.eventId) });
}
export async function createRequest(request, response) {
  const data = await requestService.createOrganizerRequest(request.user.id, request.validated.body);
  response.status(201).json({ success: true, data });
}
