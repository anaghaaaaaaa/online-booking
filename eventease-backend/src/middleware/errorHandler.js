import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(request, response, next) {
  next(new ApiError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  let status = error.status || 500;
  let message = error.message || 'Internal server error.';
  let errors = error.errors;
  if (error.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'A record with these details already exists.';
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 422;
    message = 'A referenced record does not exist.';
  }
  if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    status = 409;
    message = 'This record is still in use and cannot be deleted.';
  }
  if (status >= 500 && env.NODE_ENV === 'production') message = 'Internal server error.';
  if (status >= 500) console.error(error);
  response.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
}
