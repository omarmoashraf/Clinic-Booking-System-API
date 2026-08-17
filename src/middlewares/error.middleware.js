import { AppError } from '../errors/AppError.js';

/**
 * Centralized error handling middleware
 *
 * Catches all errors thrown in the request pipeline and formats them
 * into consistent HTTP responses.
 *
 * Error handling priority:
 * 1. Custom AppError instances (have statusCode and status)
 * 2. Generic Error objects (default to 500)
 * 3. Unknown errors (wrapped as internal server error)
 *
 * Response format:
 * {
 *   status: string,        // 'success', 'error', 'validation_error', 'not_found', etc.
 *   message: string,       // User-facing error message
 *   ...(validation errors)  // Additional fields for specific error types
 * }
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let status = 'error';
  let message = 'An unexpected error occurred';
  let responseBody = {};

  // Handle custom AppError instances (AppError, ValidationError, NotFoundError, etc.)
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    status = err.status;
    message = err.message;

    // Include validation errors if present
    if (err.errors) {
      responseBody.errors = err.errors;
    }
  }
  // Handle generic Error objects
  else if (err instanceof Error) {
    statusCode = 500;
    status = 'error';
    // Only expose error message in development; hide in production
    message =
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Internal server error';
  }
  // Handle unknown errors
  else {
    statusCode = 500;
    status = 'error';
    message = 'An unknown error occurred';
  }

  // Never expose sensitive details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
  }

  // Build response
  const response = {
    status,
    message,
    ...responseBody,
  };

  // Optional: Log error for observability
  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] ${statusCode} Error:`, err);
  }

  res.status(statusCode).json(response);
};

export default errorHandler;
