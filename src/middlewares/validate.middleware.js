/**
 * Validation middleware factory
 *
 * Receives an object with optional Zod schemas:
 * { body?: ZodSchema, params?: ZodSchema, query?: ZodSchema }
 *
 * For each schema provided, validates the corresponding request property
 * and replaces it with the parsed (transformed) result.
 * On validation failure, passes the error to the centralized error
 * middleware, which converts ZodError into a ValidationError response.
 *
 * Example:
 *   router.post('/appointments',
 *     validate({ body: appointmentSchema, params: paramSchema }),
 *     controller.createAppointment
 *   );
 */
const validate = (schemas) => {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validate;