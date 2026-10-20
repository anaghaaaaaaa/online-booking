import * as contactService from '../services/contactService.js';

export async function create(request, response) {
  const result = await contactService.saveContactMessage(request.validated.body);
  response.status(201).json({ success: true, data: result });
}
