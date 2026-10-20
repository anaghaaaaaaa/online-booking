import { ApiError } from '../utils/ApiError.js';

export const requireRole = (...roles) => (request, response, next) => {
  if (!request.user || !roles.includes(request.user.role)) {
    return next(new ApiError(403, 'You do not have permission to access this resource.'));
  }
  next();
};
