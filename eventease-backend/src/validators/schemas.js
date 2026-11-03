import { z } from 'zod';

const id = z.coerce.number().int().positive();
const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const futureDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value) > new Date(), 'Event date must be in the future.');
const imageUrl = z.string().url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));

export const noInputSchema = z.object({ body: z.any().optional(), params: z.object({}).optional(), query: z.object({}).optional() });
export const idOnlySchema = z.object({ params: z.object({ id }) });
export const adminEventsQuerySchema = z.object({ query: z.object({ q: z.string().max(120).optional(), status: z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled', 'Removed']).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
export const adminUsersQuerySchema = z.object({ query: z.object({ q: z.string().max(120).optional(), role: z.enum(['user', 'organizer', 'admin']).optional(), status: z.enum(['Active', 'Blocked']).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
export const adminRequestsQuerySchema = z.object({ query: z.object({ status: z.enum(['Pending', 'Approved', 'Rejected']).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
export const reportsQuerySchema = z.object({ query: z.object({ eventId: id.optional(), range: z.enum(['7d', '30d', '6m', 'all', 'custom']).optional(), from: z.string().date().optional(), to: z.string().date().optional() }) });
export const activityQuerySchema = z.object({ query: z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional(), type: z.string().max(80).optional(), from: z.string().date().optional(), to: z.string().date().optional() }) });
export const categoryParamsSchema = z.object({ params: z.object({ id }) });
export const registerSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(120), email, password: z.string().min(8).max(72) }) });
export const loginSchema = z.object({ body: z.object({ email, password: z.string().min(1).max(72) }) });
export const profileSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(40).nullable().optional(), organization_name: z.string().trim().max(160).nullable().optional(), bio: z.string().trim().max(500).nullable().optional() }).refine((value) => Object.keys(value).length > 0) });
export const passwordSchema = z.object({ body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: z.string().min(8).max(72) }) });
export const publicEventsSchema = z.object({ query: z.object({ q: z.string().max(120).optional(), location: z.string().max(120).optional(), category: z.string().max(30).optional(), dateFrom: z.string().date().optional(), dateTo: z.string().date().optional(), price: z.enum(['free', 'lt50', 'mid', 'gt100']).optional(), sort: z.enum(['date', 'low', 'high']).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
export const eventIdSchema = z.object({ params: z.object({ id }) });
export const bookingCreateSchema = z.object({ body: z.object({ eventId: id, quantity: z.coerce.number().int().min(1).max(10) }) });
export const bookingIdSchema = z.object({ params: z.object({ id }), body: z.object({ reason: z.string().trim().max(500).optional() }).optional() });
export const listQuerySchema = z.object({ query: z.object({ q: z.string().max(120).optional(), status: z.enum(['Confirmed', 'Cancelled', 'Completed']).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
export const contactSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(120), email, message: z.string().trim().min(10).max(3000) }) });
export const requestSchema = z.object({ body: z.object({ organizationName: z.string().trim().min(2).max(160), reason: z.string().trim().min(20).max(2000) }) });

const eventFields = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(30).max(10000),
  categoryId: id,
  eventDate: futureDate,
  venue: z.string().trim().min(2).max(180),
  city: z.string().trim().min(2).max(120),
  bannerImage: imageUrl,
  ticketPrice: z.coerce.number().min(0).max(99999999.99),
  capacity: z.coerce.number().int().min(1).max(100000)
});
export const createEventSchema = z.object({ body: eventFields });
export const updateEventSchema = z.object({ params: z.object({ id }), body: eventFields.partial().refine((value) => Object.keys(value).length > 0) });
export const organizerEventQuerySchema = z.object({ query: z.object({ q: z.string().max(120).optional(), status: z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled', 'Removed']).optional(), categoryId: id.optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
export const bookingQuerySchema = z.object({ params: z.object({ id }).partial().optional(), query: z.object({ q: z.string().max(120).optional(), status: z.enum(['Confirmed', 'Cancelled']).optional(), eventId: id.optional(), organizerId: id.optional(), from: z.string().date().optional(), to: z.string().date().optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
export const rejectSchema = z.object({ params: z.object({ id }), body: z.object({ reason: z.string().trim().min(10).max(1000) }) });
export const removeSchema = z.object({ params: z.object({ id }), body: z.object({ reason: z.string().trim().min(10).max(1000) }) });
export const userStatusSchema = z.object({ params: z.object({ id }), body: z.object({ status: z.enum(['Active', 'Blocked']) }) });
export const userRoleSchema = z.object({ params: z.object({ id }), body: z.object({ role: z.enum(['user', 'organizer']) }) });
export const requestReviewSchema = z.object({ params: z.object({ id }), body: z.object({ note: z.string().trim().max(1000).optional() }) });
