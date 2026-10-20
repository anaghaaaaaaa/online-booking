import { ApiError } from '../utils/ApiError.js';

export const validate = (schema) => (request, response, next) => {
  const result = schema.safeParse({ body: request.body, params: request.params, query: request.query });
  if (!result.success) {
    return next(new ApiError(422, 'Request validation failed.', result.error.flatten()));
  }
  request.validated = result.data;
  next();
};
