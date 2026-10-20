import * as bookingService from '../services/bookingService.js';

export async function create(request, response) {
  const booking = await bookingService.createBooking(request.user, request.validated.body);
  response.status(201).json({ success: true, data: { booking, message: 'Booking confirmed. No payment was processed.' } });
}

export async function list(request, response) {
  const data = await bookingService.listUserBookings(request.user.id, request.validated.query);
  response.json({ success: true, data });
}

export async function get(request, response) {
  const booking = await bookingService.getUserBooking(request.user.id, request.validated.params.id);
  response.json({ success: true, data: { booking } });
}

export async function cancel(request, response) {
  const data = await bookingService.cancelUserBooking(request.user.id, request.validated.params.id, request.validated.body?.reason);
  response.json({ success: true, data });
}

export async function tickets(request, response) {
  const items = await bookingService.listTickets(request.user.id);
  response.json({ success: true, data: { items } });
}

export async function summary(request, response) {
  const data = await bookingService.dashboardSummary(request.user.id);
  response.json({ success: true, data });
}
