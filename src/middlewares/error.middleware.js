import { ZodError } from 'zod';
import config from '../config/index.js';
import { AppError, ValidationError } from '../errors/AppError.js';

const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';

/**
 * Centralized error handling middleware
 *
 * Catches all errors thrown in the request pipeline and formats them
 * into consistent HTTP responses. Registered last, after all routes.
 *
 * Error handling priority (see docs/VALIDATION_ERROR_HANDLING.md):
 * 1. AppError instances — use their statusCode and status
 * 2. ZodError — converted to a ValidationError (400)
 * 3. Generic Error objects — honor err.statusCode if set, else 500;
 *    the real message is only exposed in development
 *
 * Response format:
 * {
 *   status: string,   // 'error', 'validation_error', 'not_found', etc.
 *   message: string,  // User-facing error message
 *   errors: [...]     // Only for validation errors
 * }
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let status = 'error';
  let message = INTERNAL_SERVER_ERROR_MESSAGE;
  let extraFields = {};

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    status = err.status;
    message = err.message;

    if (err.errors) {
      extraFields.errors = err.errors;
    }
  } else if (err instanceof ZodError) {
    const validationError = ValidationError.fromZodError(err);
    statusCode = validationError.statusCode;
    status = validationError.status;
    message = validationError.message;
    extraFields.errors = validationError.errors;
  } else {
    statusCode = err.statusCode ?? 500;

    if (config.env.isDev || statusCode < 500) {
      message = err.message;
    }
  }

  if (config.env.isDev && err.stack) {
    extraFields.stack = err.stack;
  }

  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] ${statusCode} Error:`, err);
  }

  res.status(statusCode).json({
    status,
    message,
    ...extraFields,
  });
};

export default errorHandler;