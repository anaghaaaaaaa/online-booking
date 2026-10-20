import { randomBytes } from 'node:crypto';

export function createTicketId() {
  return `TK-${randomBytes(4).toString('hex').toUpperCase()}`;
}
