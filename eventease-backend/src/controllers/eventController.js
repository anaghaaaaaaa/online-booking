import * as eventService from '../services/eventService.js';

export async function list(request, response) {
  const data = await eventService.listPublicEvents(request.validated.query);
  response.json({ success: true, data });
}

export async function get(request, response) {
  const event = await eventService.getPublicEvent(request.validated.params.id);
  response.json({ success: true, data: { event } });
}

export async function categories(request, response) {
  const items = await eventService.listCategories();
  response.json({ success: true, data: { items } });
}
