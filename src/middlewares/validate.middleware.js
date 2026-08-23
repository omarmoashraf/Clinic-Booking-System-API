/**
 * Validation middleware factory
 *
 * Accepts either:
 *   - a Zod object whose shape has body/params/query keys
 *     (e.g. z.object({ body: z.object({...}) })), or
 *   - a plain object with optional Zod schemas:
 *     { body?: ZodSchema, params?: ZodSchema, query?: ZodSchema }
 *
 * For each schema provided, validates the corresponding request property
 * and replaces it with the parsed (transformed) result.
 * On validation failure, passes the error to the centralized error
 * middleware, which converts ZodError into a ValidationError response.
 *
 * Example:
 *   router.post('/appointments',
 *     validate(appointmentSchema),
 *     controller.createAppointment
 *   );
 */
const validate = (schemas) => {
  const sections = schemas && schemas.shape ? schemas.shape : schemas;

  return (req, res, next) => {
    try {
      if (sections.body) {
        req.body = sections.body.parse(req.body);
      }

      if (sections.params) {
        req.params = sections.params.parse(req.params);
      }

      if (sections.query) {
        const parsedQuery = sections.query.parse(req.query);

        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validate;