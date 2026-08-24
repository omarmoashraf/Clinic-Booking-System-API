# Clinic Booking API — Architecture

## Overview

The application is a single, modular Express.js service with clear separation of concerns between routing, HTTP handling, business logic, and data access. There is no microservices split, no dependency injection framework, and no generic repository abstraction beyond what genuinely simplifies data access — the goal is a structure that stays easy to follow while still keeping each layer's responsibility distinct.

## Layers

### Routes

Responsible for:
- Declaring endpoints and HTTP methods
- Wiring up middleware (auth, validation) for each route
- Delegating to the matching controller

Routes contain no business logic and no direct database access — just endpoint definitions and middleware composition.

### Controllers

Responsible for:
- Reading data from the HTTP request (params, query, body, authenticated user)
- Calling the appropriate service method
- Shaping and returning the HTTP response with the correct status code

Controllers do not contain database queries or business rules — they translate between HTTP and the service layer.

### Services

Responsible for:
- Business logic and business rules (e.g. checking a slot is available before booking, enforcing ownership)
- Coordinating multiple repository calls, including transactions where necessary (e.g. booking an appointment)
- Throwing custom application errors when a business rule is violated

### Repositories

Responsible for:
- All Prisma queries for a given entity (e.g. `appointment.repository.js` wraps `prisma.appointment.*` calls)
- Nothing else — no business logic, no request/response handling

This layer exists because it keeps Prisma-specific query code in one place per entity, which makes services easier to read and test. It is intentionally thin — a wrapper around Prisma calls, not a generic/abstracted data-access framework.

### Validators

Responsible for:
- Defining request validation schemas (Zod or Joi) for bodies, params, and query strings
- Used by validation middleware to reject malformed requests before they reach a controller

### Middleware

- **Authentication:** verifies the JWT on protected routes and attaches the authenticated user to the request.
- **Authorization:** checks the authenticated user's role against what a route requires.
- **Validation:** runs a route's validator against the incoming request and returns a 400 on failure.
- **Logging:** logs each request (method, path, status, duration) for observability.
- **Error handling:** a single centralized middleware, registered last, that catches everything thrown upstream and formats the HTTP error response.

### Errors

A small set of custom error classes (e.g. `AppError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`), each carrying an HTTP status code. Services throw these directly; the centralized error middleware maps them to responses. This avoids building an elaborate error hierarchy while still giving each failure case a clear, distinguishable type.

### Configuration

Environment variables are loaded once (via `dotenv`) and read through a single `config` module that validates and parses required variables at startup before exposing them as a typed-feeling object (e.g. `config.jwt.secret`, `config.db.url`). The JWT block (`config.jwt`) carries the signing secret and the access/refresh token lifetimes; the refresh lifetime is parsed to milliseconds for expiry calculation. Application modules, including the Prisma client setup, consume this config object rather than reading `process.env` directly. The Prisma CLI separately reads `DATABASE_URL` through `prisma.config.ts` because it runs outside the application process.

### Lib

Shared infrastructure that isn't a "layer" of its own: the Prisma client instance (instantiated once and exported), and any other small shared setup (e.g. the logger instance). Kept separate from `utils` (pure helper functions) to make the distinction between "infrastructure" and "helpers" explicit.

## Request Lifecycle

```text
HTTP Request
    ↓
Express Router
    ↓
Logging Middleware
    ↓
Authentication Middleware (if route is protected)
    ↓
Authorization Middleware (if route is role-restricted)
    ↓
Validation Middleware
    ↓
Controller
    ↓
Service (business logic, ownership checks, transactions)
    ↓
Repository
    ↓
Prisma
    ↓
PostgreSQL
    ↓
Repository → Service → Controller
    ↓
HTTP Response
    (or: thrown error → centralized error middleware → HTTP error response)
```

## Authentication Architecture

The system uses short-lived access tokens (JWT) and rotating refresh tokens persisted in PostgreSQL:

```text
Login request
→ Controller reads credentials
→ AuthService verifies email/password (bcrypt compare)
→ AuthService issues an access token (JWT: sub + role) and an opaque refresh token
→ Refresh token SHA-256 hash persisted in "RefreshToken" (new rotation family)
→ Response returns access token, refresh token, and user to the client

Refresh request
→ AuthService looks up the refresh token by hash
→ Verifies it exists, is not revoked, has not expired, and the account is active
→ Rotates: revokes the presented token and issues a new pair (atomic transaction)
→ Reuse of an already-revoked token revokes the whole family (theft response)

Logout request
→ AuthService revokes the presented token's family (session chain ended)

Subsequent requests
→ Client sends "Authorization: Bearer <access token>"
→ Authentication middleware verifies the token and confirms the user is still active
→ Decoded { sub, role } attached to req.user as { id, role }
→ Request proceeds to authorization/validation/controller
```

Access tokens live 15 minutes; refresh tokens 30 days. A deactivated account is rejected by the middleware on every protected request (the middleware always re-checks `is_active` against the database) and refresh refuses to issue tokens for it. All of the token, lockout, and revocation state is database-backed — no Redis or other infrastructure is required.

Login failure handling: failed attempts are counted on the `"User"` row (5 attempts → 15 minute lock), and every login failure returns the same generic 401 to avoid user enumeration.

### Password hashing

`src/utils/hash.js` wraps bcrypt (cost factor 10). The service never sees plaintext passwords outside the hashing call, and the hash utility is the only module allowed to import bcrypt.

## Authorization Architecture

Role-based checks are implemented as a small middleware factory:

```js
// conceptual, not final implementation
requireRole('DOCTOR')
```

applied per-route after the authentication middleware. It reads `req.user.role` (set by authentication) and rejects with a 403 if it doesn't match. Where a rule is about *ownership* rather than role (e.g. "a patient can only cancel their own appointment"), that check lives in the service layer, since it depends on data the middleware doesn't have — the role middleware only ever answers "is this user allowed to call this kind of endpoint at all."

Roles: `PATIENT`, `DOCTOR`, `ADMIN`.

Admin accounts have no HTTP creation endpoint. `npm run create-admin` bootstraps admin accounts from local environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`) and refuses to run in production, keeping privileged account provisioning outside the public API.

## Error Handling Architecture

- **Custom application errors** — thrown by services, each with a status code and message (e.g. `throw new ConflictError('Slot is already booked')`).
- **Validation errors** — produced by the validation middleware when a Zod/Joi schema fails; formatted as a 400 with per-field messages.
- **Authentication errors** — missing/invalid/expired token → 401.
- **Authorization errors** — valid user, wrong role or not the resource owner → 403.
- **Database errors** — unexpected Prisma errors (e.g. constraint violations not already caught by a service-level check) are caught and mapped to a generic 409/500 rather than leaking raw Prisma error details to the client.
- **Unexpected errors** — anything uncaught is logged and returned as a generic 500 with no internal details exposed.

All of the above are handled by one centralized error-handling middleware (registered after all routes), so no controller writes its own try/catch error-formatting logic — controllers/services simply throw, and Express's error-handling middleware (via `next(err)` or an async wrapper) catches it.

## Folder Structure

```text
src/
├── config/
│   └── index.js
├── middlewares/
│   ├── auth.middleware.js
│   ├── role.middleware.js
│   ├── validate.middleware.js
│   ├── logger.middleware.js
│   └── error.middleware.js
├── routes/
│   ├── auth.routes.js
│   ├── doctors.routes.js
│   ├── patients.routes.js
│   ├── specialties.routes.js
│   ├── availability.routes.js
│   ├── appointments.routes.js
│   ├── admin.routes.js
│   ├── users.routes.js
│   └── index.js
├── controllers/
│   ├── auth.controller.js
│   ├── doctors.controller.js
│   ├── patients.controller.js
│   ├── specialties.controller.js
│   ├── availability.controller.js
│   ├── appointments.controller.js
│   ├── admin.controller.js
│   └── users.controller.js
├── services/
│   ├── auth.service.js
│   ├── doctors.service.js
│   ├── patients.service.js
│   ├── specialties.service.js
│   ├── availability.service.js
│   ├── appointments.service.js
│   ├── admin.service.js
│   └── users.service.js
├── repositories/
│   ├── user.repository.js
│   ├── refresh-token.repository.js
│   ├── doctor.repository.js
│   ├── patient.repository.js
│   ├── specialty.repository.js
│   ├── availability.repository.js
│   └── appointment.repository.js
├── validators/
│   ├── auth.validator.js
│   ├── doctor.validator.js
│   ├── patient.validator.js
│   ├── availability.validator.js
│   └── appointment.validator.js
├── errors/
│   └── AppError.js  (+ NotFoundError, ValidationError, etc.)
├── scripts/
│   └── create-admin.js  (local-only admin bootstrap)
├── utils/
│   ├── hash.js  (bcrypt wrapper)
│   └── jwt.js   (access-token sign/verify)
├── lib/
│   ├── prisma.js
│   └── logger.js
└── app.js
```

Each feature (e.g. appointments) is represented by one file per layer — `appointments.routes.js`, `appointments.controller.js`, `appointments.service.js`, `appointment.repository.js`, `appointment.validator.js` — rather than a nested per-feature folder. At this project's size, flat files grouped by layer stay easier to navigate than deep per-feature nesting.

## Design Principles

- Separation of concerns between routing, HTTP handling, business logic, and data access
- Single responsibility per module
- Thin controllers — no business logic or database calls
- Business logic and business rules live in services, not controllers or routes
- Database access isolated to repositories
- Validation happens at the boundary, before a request reaches a controller
- Centralized, consistent error handling
- Consistent API response shapes across all endpoints
- No abstraction introduced without a concrete need for it in this project
