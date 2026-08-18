/**
 * Base application error class.
 * All custom errors inherit from this and should specify a statusCode.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, status = 'error') {
    super(message);
    this.statusCode = statusCode;
    this.status = status;
    this.name = this.constructor.name;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * 400 Bad Request — request validation failed
 */
export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', errors = null) {
    super(message, 400, 'validation_error');
    this.errors = errors; // Optional: array of detailed validation errors
  }

  static fromZodError(error) {
    const issues = error.issues.map((issue) => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
      code: issue.code,
    }));

    return new ValidationError('Request validation failed', issues);
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Requested resource') {
    super(`${resource} not found`, 404, 'not_found');
    this.resource = resource;
  }
}

/**
 * 401 Unauthorized — authentication failed or missing
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'unauthorized');
  }
}

/**
 * 403 Forbidden — authentication succeeded but user lacks permission
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'forbidden');
  }
}

/**
 * 409 Conflict — resource already exists or business rule violated
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, 'conflict');
  }
}

/**
 * 422 Unprocessable Entity — request is well-formed but contains semantic errors
 */
export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable entity') {
    super(message, 422, 'unprocessable_entity');
  }
}

/**
 * 500 Internal Server Error — unexpected server error
 */
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'internal_error');
  }
}
