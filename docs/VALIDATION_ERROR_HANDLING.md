# Validation & Error Handling Guide

## Overview

The validation and error handling system in milestone 2 consists of three key components:

1. **Custom Error Classes** (`src/errors/AppError.js`) — Standardized errors with HTTP status codes
2. **Validation Middleware** (`src/middlewares/validate.middleware.js`) — Validates requests using Zod schemas
3. **Error Handler Middleware** (`src/middlewares/error.middleware.js`) — Centralized error response formatting
4. **Request Logger Middleware** (`src/middlewares/logging.middleware.js`) — Tracks all requests

---

## 1. Custom Error Classes

Located in `src/errors/AppError.js`, these are used throughout your services to throw business logic errors.

### Available Error Types

| Error Class | HTTP Status | Use Case |
|---|---|---|
| `ValidationError` | 400 | Request data validation failed |
| `NotFoundError` | 404 | Resource doesn't exist |
| `UnauthorizedError` | 401 | User not authenticated |
| `ForbiddenError` | 403 | User lacks permission |
| `ConflictError` | 409 | Resource already exists |
| `UnprocessableEntityError` | 422 | Request is valid but can't be processed |
| `InternalServerError` | 500 | Unexpected server error |

### Example Usage in Services

```javascript
import { NotFoundError, ConflictError } from '../errors/AppError.js';

// In a service method:
const doctor = await doctorRepository.findById(doctorId);
if (!doctor) {
  throw new NotFoundError('Doctor');
}

// Check business rules
const existingSpecialty = await specialtyRepository.findByName(name);
if (existingSpecialty) {
  throw new ConflictError('Specialty with this name already exists');
}
```

---

## 2. Validation Middleware

Validates request body, params, and query using Zod schemas before they reach controllers.

### How to Use

**Step 1:** Define a Zod schema in `src/validators/`

```javascript
// src/validators/specialty.validator.js
import { z } from 'zod';

export const createSpecialtySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
  }),
});

export const updateSpecialtySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid specialty ID'),
  }),
  body: z.object({
    name: z.string().min(2),
  }),
});
```

**Step 2:** Use in routes with the validate middleware

```javascript
// src/routes/specialties.js
import { Router } from 'express';
import validate from '../middlewares/validate.middleware.js';
import { createSpecialtySchema } from '../validators/specialty.validator.js';
import specialtyController from '../controllers/specialty.controller.js';

const router = Router();

// POST /api/v1/specialties
router.post(
  '/',
  validate(createSpecialtySchema),
  specialtyController.create
);

export default router;
```

### Validation Flow

```
Request with invalid data
         ↓
Validation Middleware
         ↓
Zod detects error
         ↓
ValidationError thrown
         ↓
Error Middleware catches it
         ↓
Returns formatted 400 response with error details
```

### Example Response (Validation Error)

```json
{
  "status": "validation_error",
  "message": "Request validation failed",
  "errors": [
    {
      "field": "body.name",
      "message": "Name must be at least 2 characters",
      "code": "too_small"
    }
  ]
}
```

---

## 3. Error Handler Middleware

Catches all errors and formats them consistently.

### Error Response Format

```json
{
  "status": "error|validation_error|not_found|unauthorized|forbidden|conflict",
  "message": "Human-readable error message",
  "errors": [] // Only for validation errors
}
```

### Error Handling Flow

```
Error thrown anywhere in the app
         ↓
Error bubbles up to error middleware
         ↓
Middleware checks error type
         ├─ AppError? → Use statusCode and status
         ├─ ZodError? → Already converted to ValidationError
         └─ Generic Error? → Default to 500
         ↓
Format and send HTTP response
```

### HTTP Status Codes

- **2xx Success** — Request succeeded
- **4xx Client Error** — Client's fault (validation, auth, not found, etc.)
- **5xx Server Error** — Server's fault (internal errors)

**In production**, 5xx errors hide the actual message for security. In development, the full error is shown.

---

## 4. Request Logger Middleware

Logs every request in the format: `[timestamp] METHOD PATH → STATUS (duration)`

### Log Examples

```
[14:23:45] ✅ GET    /api/v1/health → 200 (2ms)
[14:23:47] ⚠️  POST   /api/v1/specialties → 400 (5ms)
[14:23:49] ❌ GET    /api/v1/doctors/invalid-id → 500 (8ms)
```

### Symbols

- `✅` = 2xx (Success)
- `→` = 3xx (Redirect)
- `⚠️` = 4xx (Client Error)
- `❌` = 5xx (Server Error)

---

## Middleware Order in `app.js`

**CRITICAL:** Middleware order matters!

```javascript
app.use(requestLogger);      // 1. Log all requests first
app.use(express.json());     // 2. Parse JSON
// app.use(authenticate);     // 3. Auth (when added)
app.use('/api/v1', routes);  // 4. Route handlers
app.all('*', 404Handler);    // 5. 404 for unmapped routes
app.use(errorHandler);       // 6. Error handler LAST
```

**Why the order?**
- Logger captures the start time before anything else
- `express.json()` parses the body before validation
- Error middleware must be **last** to catch everything

---

## Common Patterns

### Pattern 1: Basic Validation → Business Logic → Response

```javascript
// Controller
export const createSpecialty = async (req, res, next) => {
  try {
    // req.body is already validated by middleware
    const specialty = await specialtyService.create(req.body);
    res.status(201).json({
      status: 'success',
      data: specialty,
    });
  } catch (error) {
    next(error); // Pass to error middleware
  }
};
```

### Pattern 2: Conditional Business Logic Errors

```javascript
// Service
export const bookAppointment = async (patientId, appointmentId) => {
  const appointment = await appointmentRepository.findById(appointmentId);
  
  if (!appointment) {
    throw new NotFoundError('Appointment');
  }
  
  if (appointment.status !== 'AVAILABLE') {
    throw new ConflictError('Appointment is no longer available');
  }
  
  // Business logic here...
  return updatedAppointment;
};
```

### Pattern 3: Validation with Params and Query

```javascript
const getAppointmentsSchema = z.object({
  params: z.object({
    doctorId: z.string().uuid(),
  }),
  query: z.object({
    date: z.string().date().optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
  }),
});

router.get(
  '/doctors/:doctorId/appointments',
  validate(getAppointmentsSchema),
  appointmentController.getByDoctor
);
```

---

## Testing Validation

Use the `/test-error` route to verify error handling:

```bash
# Should return 500 with formatted error
curl http://localhost:3000/api/v1/test-error
```

Output:
```json
{
  "status": "error",
  "message": "Temporary error route"
}
```

---

## Checklist for Adding New Routes

- [ ] Create Zod schema in `src/validators/[feature].validator.js`
- [ ] Import schema and validation middleware in route file
- [ ] Wrap controller with `validate(schema)`
- [ ] Throw appropriate errors in service layer
- [ ] Test with valid and invalid requests

---

## Architecture Diagram

```
HTTP Request
    ↓
Request Logger Middleware (logs time)
    ↓
Express JSON Parser
    ↓
Route Handler → Validation Middleware
    ├─ Valid ✅ → next() → Controller
    └─ Invalid ❌ → next(ValidationError) ↘
                                           ↓
Controller → Service → Repository → DB   Error Handler
    ↓                                    (catches all errors)
Response OK or error thrown                ↓
         ↓                          HTTP Error Response
         └──────────────────────────────────────┘
```

---

## Environment-Based Behavior

The error middleware behaves differently based on `NODE_ENV`:

### Development (`NODE_ENV=development`)
- Full error messages exposed
- Stack traces helpful for debugging
- All error details visible

### Production (`NODE_ENV=production`)
- 5xx errors hidden (returns generic message)
- Sensitive info never exposed
- Errors logged server-side

---

## Next Steps (Milestone 3)

Once validation and error handling are solid, implement:

1. **Authentication Middleware** — JWT verification
2. **Authorization Middleware** — Role-based access control
3. **First Feature** — Complete end-to-end (Doctors or Specialties API)

