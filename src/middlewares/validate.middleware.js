import { ZodError } from 'zod';
import { ValidationError } from '../errors/AppError.js';

/**
 * Validation middleware factory
 *
 * Receives an object with optional Zod schemas:
 * { body?: ZodSchema, params?: ZodSchema, query?: ZodSchema }
 *
 * For each schema provided, validates the corresponding request property.
 * On validation success, calls next().
 * On validation failure, passes ValidationError to error middleware.
 *
 * Example:
 *   router.post('/appointments',
 *     validate({ body: appointmentSchema, params: paramSchema }),
 *     controller.createAppointment
 *   );
 */
const validate = (schemas = {}) => {
  return (req, res, next) => {
    try {
      // Validate request body if schema provided
      if (schemas.body) {
        const validatedBody = schemas.body.parse(req.body);
        req.body = validatedBody; // Replace with parsed/transformed data
      }

      // Validate request params if schema provided
      if (schemas.params) {
        const validatedParams = schemas.params.parse(req.params);
        req.params = validatedParams;
      }

      // Validate request query if schema provided
      if (schemas.query) {
        const validatedQuery = schemas.query.parse(req.query);
        req.query = validatedQuery;
      }

      // All validations passed
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.') || 'root',
          message: err.message,
          code: err.code,
        }));

        return next(
          new ValidationError('Request validation failed', formattedErrors)
        );
      }

      // Pass any other errors to error middleware
      next(error);
    }
  };
};

export default validate;