# Clinic Booking System — Engineering Milestones

This roadmap is derived from the actual repository state: the code in `src/`, the Prisma schema and migrations in `prisma/`, the API contract in `docs/API.md`, and the design decisions in `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, and `docs/PRD.md`.

## Progress at a Glance

| # | Milestone | Status |
|---|---|---|
| 1 | Project Foundation & Tooling | ✅ Completed |
| 2 | Database Design & Prisma Setup | ✅ Completed |
| 3 | Layered Architecture & Project Structure | ✅ Completed |
| 4 | Validation & Centralized Error Handling | ✅ Completed |
| 5 | Authentication & Session Management | ✅ Completed |
| 6 | Authorization Layer | ✅ Completed |
| 7 | Authentication Hardening | ✅ Completed |
| 8 | Testing (Auth Focus) | ✅ Completed |
| 9 | Specialties Module (First Feature) | ✅ Completed |
| 10 | Doctors Module | ✅ Completed |
| 11 | Patients Module | ✅ Completed |
| 12 | Availability & Scheduling | ✅ Completed |
| 13 | Appointments & Booking | ✅ Completed |
| 14 | Admin Module | ✅ Completed |
| 15 | API Documentation (Swagger) | ✅ Completed |
| 16 | Security Hardening & Production Readiness | ✅ Completed |

---

## Milestone 1 — Project Foundation & Tooling

**Status:** ✅ Completed

**Goal**
A runnable Express application skeleton with sane configuration, environment handling, and a health check.

**What I need to implement**
- Initialize `package.json` with ESM (`"type": "module"`) and the core dependencies (express, dotenv, prisma, zod, jsonwebtoken, bcrypt, cookie-parser)
- Add dev/start scripts (`nodemon` for dev)
- Create `src/app.js` with the Express middleware stack and a health endpoint
- Create `src/config/index.js`: load `.env` via dotenv, validate and parse env vars with Zod at startup (fail fast on invalid config), expose a typed-feeling `config` object
- Add `.gitignore` (`.env`, `node_modules`, generated client)
- Add a DB connectivity smoke script

**Current state**
Everything exists: `src/app.js` (logger → json → cookie-parser → routes → 404 → error middleware), `src/config/index.js` (Zod-validated `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET` ≥ 32 chars, JWT lifetimes, refresh lifetime parsed to ms), `GET /api/v1/health` in `src/routes/healthCheck.js`, `npm run dev` / `start` / `test:db` scripts, and `.env` is git-ignored.

**Engineering concepts learned**
- Environment configuration and fail-fast startup validation
- Middleware ordering in Express
- ESM modules and npm scripts
- Keeping secrets out of the repository

**Acceptance criteria**
- `npm run dev` boots the server on the configured port
- Invalid/missing required env vars abort startup with a clear message
- `GET /api/v1/health` returns 200 `{ status: 'success' }`

---

## Milestone 2 — Database Design & Prisma Setup

**Status:** ✅ Completed

**Goal**
A normalized PostgreSQL schema matching the product, managed with Prisma migrations, with constraints as the primary data-integrity safeguard.

**What I need to implement**
- Define Prisma models: `User`, `RefreshToken`, `Specialty`, `Doctor`, `Patient`, `Availability`, `Appointment` + enums `Role`, `AvailabilityStatus`, `AppointmentStatus`
- Encode constraints in the schema: unique email, unique `token_hash`, one-to-one `Doctor.user_id` / `Patient.user_id`, FKs with `ON DELETE RESTRICT`, indexes for the real query patterns (`User.email`, `RefreshToken.user_id/family_id`, `Availability(doctor_id, date)`, `Appointment(patient_id/doctor_id)`)
- Create the foundation migration and the refresh-token/lockout migration
- Wire the Prisma 7 client with the `PrismaPg` driver adapter and `prisma.config.ts`
- Align the Prisma CLI with `@prisma/client` so `validate` / `generate` / `migrate` work

**Current state**
Complete. `prisma/schema.prisma` has all six models and three enums; four migrations exist (`20260814125914_init`, `20260819120649_add_refresh_tokens_and_lockout`, `20260824235847_add_availability_end_time_check`, `20260825094959_appointment_partial_unique_index`); `src/lib/prisma.js` instantiates the client with the pg adapter; `@prisma/client` and `prisma` CLI are aligned to version `7.9.1`, passing `validate`, `generate`, and `migrate status`.

**Engineering concepts learned**
- Relational data modeling (1:1 extension tables, 1:N, denormalized references)
- Database constraints as the backstop, application logic as a second layer
- Prisma migrations workflow and the driver-adapter architecture
- Toolchain alignment (CLI ↔ client version pairing)

**Acceptance criteria**
- `npx prisma validate` passes
- `npx prisma migrate status` reports "Database schema is up to date"
- All FKs, uniques, and indexes from `docs/DATABASE.md` exist in the migrations

---

## Milestone 3 — Layered Architecture & Project Structure

**Status:** ✅ Completed

**Goal**
A layered Express structure (routes → controllers → services → repositories) with clear, documented responsibilities, plus the shared infrastructure (logger, Prisma client) and error classes.

**What I need to implement**
- Create the layer folders: `routes/`, `controllers/`, `services/`, `repositories/`, `middlewares/`, `validators/`, `errors/`, `utils/`, `lib/`
- Custom error classes (`AppError` + `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `UnprocessableEntityError`, `InternalServerError`)
- Repository functions that accept a transaction client parameter (`client = prisma` default)
- Write `docs/ARCHITECTURE.md` documenting the request lifecycle and layer responsibilities

**Current state**
Complete. The exact structure above exists; `src/errors/AppError.js` holds the error hierarchy; repositories follow the `(data, client = prisma)` transaction-friendly pattern; `docs/ARCHITECTURE.md` documents the design.

**Engineering concepts learned**
- Separation of concerns and single responsibility
- The repository pattern (thin Prisma wrappers, transaction injection)
- When abstraction is justified vs. over-engineering

**Acceptance criteria**
- No controller, route, or middleware performs direct Prisma queries
- No business rule lives in a repository or controller
- A new feature can be added by following the existing one-file-per-layer pattern

---

## Milestone 4 — Validation & Centralized Error Handling

**Status:** ✅ Completed

**Goal**
Reject malformed input at the boundary with Zod, and format every failure through one centralized error middleware with consistent response shapes.

**What I need to implement**
- Zod schemas per endpoint (`body`, `params`, `query`)
- A `validate` middleware factory that parses and replaces `req.body` / `req.params` / `req.query`
- Custom error classes mapped to HTTP status codes
- A centralized error handler: `AppError` → its status, `ZodError` → 400 with per-field details, generic errors → 500 with the real message hidden in production
- A request logger middleware

**Current state**
Implemented and working across all modules (`validate.middleware.js`, `error.middleware.js`, `logging.middleware.js`, and all domain validators). Prisma errors are mapped in `error.middleware.js` (`P2002` → 409, `P2003` → 409, `P2025` → 404, generic → 500).

**Engineering concepts learned**
- Boundary validation vs. business-logic validation
- Error class hierarchies and centralized error formatting
- Zod parsing with transformed output
- Not leaking internal error details to clients

**Acceptance criteria**
- Every endpoint rejects malformed input with 400 + per-field `errors`
- All auth errors return 401, permission errors 403, duplicates 409, not-found 404
- Production 5xx responses contain no internal error details
- Prisma `P2002` (duplicate key) returns 409, not 500

---

## Milestone 5 — Authentication & Session Management

**Status:** ✅ Completed

**Goal**
Full authentication: registration, login, short-lived JWT access tokens, rotating DB-backed refresh tokens with family-based reuse detection, logout, and login lockout.

**What I need to implement**
- `register`: normalize email, check duplicates, bcrypt-hash (cost 10), create `User` + `Doctor`/`Patient` profile in one transaction, never auto-authenticate
- `login`: uniform-timing password compare (dummy hash for unknown emails), identical generic 401 for every failure, lockout after 5 failed attempts for 15 minutes, reset on success, issue access + refresh tokens
- Refresh tokens: 48 random bytes, stored only as SHA-256 with a unique index, 30-day expiry
- `refresh`: look up by hash, reject unknown/revoked/expired/inactive-user tokens, rotate atomically (`revokeIfActive` guard + create in one transaction), return a new access + refresh pair, revoke the whole family when a revoked token is reused
- `logout`: revoke the presented token's family
- `authenticate` middleware: verify the Bearer JWT, validate `sub`, re-check the user is still active against the DB, attach `{ id, role }` to `req.user`
- Lockout state on the `User` row with atomic failed-attempt counting
- Local-only `create-admin` bootstrap script that refuses to run in production

**Current state**
Complete and thoroughly tested. All four auth endpoints work end-to-end with token rotation, revocation, lockout, and active-user validation.

**Engineering concepts learned**
- Password hashing (bcrypt cost, the 72-byte limit) and timing-attack equalization
- JWT structure, signing, and expiry
- Opaque tokens vs. JWTs; hashing tokens at rest
- Token rotation, families, and reuse detection as a theft response
- Transactional single-use semantics (`revokeIfActive` + conditional count check)
- Account lockout policies and anti-enumeration (generic error messages)
- Session invalidation: per-request active-user revalidation vs. token expiry

**Acceptance criteria**
- `POST /auth/register` creates the user + profile atomically and returns no tokens
- `POST /auth/login` returns `{ accessToken, refreshToken, user }`
- Refresh rotates the token; reusing a revoked token revokes the entire family
- A deactivated user is rejected on every protected request and cannot refresh
- After 5 failed logins the account is locked for 15 minutes; all failures return the identical 401
- `POST /auth/logout` revokes the presented token's family and returns 204

---

## Milestone 6 — Authorization Layer

**Status:** ✅ Completed

**Goal**
Role-based access control (PATIENT / DOCTOR / ADMIN) enforced by middleware, with ownership checks in the service layer, applied across all protected routes.

**What I need to implement**
- A `requireRole(...roles)` middleware factory that returns 403 when `req.user.role` is not allowed
- Apply `authenticate` + `requireRole` to every protected route across all modules
- Ownership checks in services where rules depend on data the middleware can't see
- Verify the full authorization matrix from `docs/API.md` across all 165+ integration tests

**Current state**
Complete. `requireRole` middleware is applied across all domain routes (`specialties`, `doctors`, `patients`, `availability`, `appointments`, and `admin`). Complete authorization matrix is verified across all endpoints via integration tests.

**Engineering concepts learned**
- Middleware composition (auth then authorization)
- Role-based vs. ownership-based authorization
- When to enforce in middleware vs. in the service layer

**Acceptance criteria**
- Every protected route requires a valid token; wrong-role requests return 403
- Ownership violations return 403 from the service layer
- The complete matrix in `docs/API.md` holds for every endpoint

---

## Milestone 7 — Authentication Hardening

**Status:** ✅ Completed

**Goal**
Close the remaining known findings from the authentication reviews and add defense-in-depth to the auth surface.

**What I need to implement**
- Concurrent-reuse family revocation running outside the transaction to guarantee revocation on token races
- Rate limiting on `/auth/login`, `/auth/register`, `/auth/refresh`
- Refresh-token input bounds (max length 256)
- Client-side token storage security guidance

**Current state**
Implemented and tested. Concurrent refresh races are handled safely, rate limiters are active, and input bounds are strictly checked.

**Engineering concepts learned**
- Transaction rollback semantics
- Defense in depth: lockout + rate limiting
- Attack scenarios: concurrent token reuse, brute force, XSS token theft

**Acceptance criteria**
- Two concurrent refresh requests with the same token result in one success and one 401, **and** the family is revoked
- Login/refresh endpoints are rate-limited
- Duplicate-email races return 409
- Register response matches `docs/API.md`

---

## Milestone 8 — Testing (Auth Focus)

**Status:** ✅ Completed

**Goal**
Lock in the authentication system with automated integration tests before building features on top of it.

**What I need to implement**
- Add a test runner (`node:test` + `supertest`) and a `npm test` script
- Test database strategy: isolated test database + `prisma migrate deploy` in test setup
- Comprehensive integration tests for all auth scenarios and security behaviors

**Current state**
Complete. The integration test suite uses `node:test` + `supertest` hitting a real PostgreSQL test database (`clinic_booking_test`). All auth and security behaviors are verified deterministically without mocking database state.

**Engineering concepts learned**
- Integration testing of HTTP flows against a real database
- Testing security behavior (lockout, rotation, reuse) — not just happy paths
- Concurrency tests for token races
- Test isolation and deterministic time control

**Acceptance criteria**
- `npm test` runs the full suite against a test database
- All four auth endpoints covered on happy and failure paths
- A concurrent-refresh test exists and passes
- Re-running the suite is deterministic (isolated DB state)

---

## Milestone 9 — Specialties Module (First Feature)

**Status:** ✅ Completed

**Goal**
The first complete feature end-to-end — a small admin-managed lookup table that exercises every layer and the authorization middleware for the first time.

**What I need to implement**
- `GET /specialties` (public, paginated)
- `GET /specialties/:id` (public)
- `POST /specialties` (ADMIN), `PATCH /specialties/:id` (ADMIN), `DELETE /specialties/:id` (ADMIN, 409 if a doctor is assigned)

**Current state**
Complete. Full layered implementation (`specialty.repository.js`, `specialties.service.js`, `specialties.controller.js`, `specialty.routes.js`, `specialty.validator.js`) with integration tests covering all endpoints and role checks.

**Engineering concepts learned**
- Building a complete vertical slice through all layers
- First real use of role-based authorization
- Pagination conventions and consistent response shapes (`data` + `meta`)

**Acceptance criteria**
- Specialties can be listed publicly and created/updated/deleted by an ADMIN only
- Deleting a specialty in use returns 409
- Non-admin requests return 403; anonymous requests return 401
- Responses follow the `{ status, data, meta? }` shapes from `docs/API.md`

---

## Milestone 10 — Doctors Module

**Status:** ✅ Completed

**Goal**
Public doctor directory plus doctor self-service profile management.

**What I need to implement**
- `GET /doctors` (public, paginated, optional specialty filter)
- `GET /doctors/:id` (public)
- `PATCH /doctors/me` (DOCTOR): update own bio / specialtyId

**Current state**
Complete. Layered implementation with public directory browsing, specialty filtering, own-profile update scoping, and full integration test coverage.

**Engineering concepts learned**
- Public read vs. authenticated write on the same resource
- The "own profile" pattern: `req.user` → profile row → service-level ownership
- Filtering + pagination queries with Prisma `include`

**Acceptance criteria**
- Anonymous users can browse the doctor directory
- A DOCTOR can update only their own profile; other roles get 403
- Specialty filter works by name and by id
- Pagination metadata matches `docs/API.md`

---

## Milestone 11 — Patients Module

**Status:** ✅ Completed

**Goal**
Patient self-service profile management and the merged `/users/me` endpoint.

**What I need to implement**
- `PATCH /patients/me` (PATIENT): update own `fullName`, `phone`, `dateOfBirth`
- `GET /users/me` (any role): authenticated user + their `Doctor` or `Patient` profile

**Current state**
Complete. Features nested transactional updates across `User` and `Patient` tables, strict date parsing for `dateOfBirth`, and a unified `/users/me` response shape.

**Engineering concepts learned**
- Merging base account data with role-specific profile data in one response shape
- Same "own profile" ownership pattern as doctors, applied to patients
- Nested Prisma writes as an implicit transaction across User + Patient rows
- Date-only validation and timezone-safe storage (`YYYY-MM-DD` ↔ UTC-midnight `Date` ↔ Postgres `DATE`)

**Acceptance criteria**
- A PATIENT updates only their own profile; other roles get 403
- `GET /users/me` returns role-appropriate profile fields

---

## Milestone 12 — Availability & Scheduling

**Status:** ✅ Completed

**Goal**
Doctors define individual bookable slots; patients can view a doctor's open slots; slot overlap is prevented.

**What I need to implement**
- `GET /doctors/:doctorId/availability` (public): list `AVAILABLE` slots, optional `from`/`to` date filter
- `POST /doctors/me/availability` (DOCTOR): create a slot (`date`, `startTime`, `endTime`)
- `DELETE /doctors/me/availability/:id` (DOCTOR): delete own unbooked slot
- Overlap prevention & database `CHECK (end_time > start_time)` constraint

**Current state**
Complete. Migration `20260824235847_add_availability_end_time_check` enforces time bounds in PostgreSQL. Slot overlap is blocked at the service level and validated against wall-clock times in clinic time (`Africa/Cairo`).

**Engineering concepts learned**
- Service-level conflict detection against database constraints
- Timezone-bound date/time handling
- Ownership checks on sub-resources
- Querying ranges (`from`/`to`) with Prisma

**Acceptance criteria**
- Overlapping slots return 409; adjacent slots are allowed
- A doctor cannot delete another doctor's slot (403) or a booked slot (409)
- `end_time > start_time` is rejected at validation, and the DB CHECK constraint exists in a migration
- Only `AVAILABLE` slots appear in public listings

---

## Milestone 13 — Appointments & Booking

**Status:** ✅ Completed

**Goal**
The core business flow: patients book available slots, cancel their own appointments, and doctors manage appointment status — with double-booking prevented at the database level.

**What I need to implement**
- Migration for partial unique index `Appointment_active_availability_key` (`WHERE status <> 'CANCELLED'`)
- `POST /appointments` (PATIENT): claim slot → set `BOOKED` → create appointment in one `$transaction`
- `GET /appointments/me` (PATIENT/DOCTOR) & `GET /appointments/:id`
- `PATCH /appointments/:id/status`: transition state machine (`PENDING → CONFIRMED → COMPLETED` / `CANCELLED`), past appointment immutability in clinic time
- Transactional cancellation releasing the slot to `AVAILABLE`

**Current state**
Complete. Includes migration `20260825094959_appointment_partial_unique_index`, compare-and-set status updates, past immutability in `Africa/Cairo`, and double-booking race protection verified by concurrent test suites.

**Engineering concepts learned**
- Transactional state changes spanning two tables (slot + appointment)
- Database-level race protection (partial unique index) vs. app-level checks
- Conditional updates as compare-and-set guards under READ COMMITTED
- Status-lifecycle state machines and their validation
- History retention vs. reusability (cancelled rows stay, slots reopen)
- Clinic-timezone instant resolution for "past" semantics (DST-aware)

**Acceptance criteria**
- Two concurrent bookings of the same slot result in exactly one success
- Cancelling releases the slot; the same slot can be booked again later
- Invalid transitions (e.g. cancelling a COMPLETED appointment) return 409
- A patient sees only their own appointments; a doctor only theirs; ADMIN sees all

---

## Milestone 14 — Admin Module

**Status:** ✅ Completed

**Goal**
Administrative oversight: user/account management and read access to all appointments.

**What I need to implement**
- `GET /admin/users` (ADMIN): paginated user directory with `role` and `isActive` filters
- `PATCH /admin/users/:id` (ADMIN): update `fullName`, `phone`, `isActive`
- Session revocation on deactivation (`refreshTokenRepo.revokeAllForUser`)
- `GET /admin/appointments` (ADMIN): read-only oversight with `status`, `doctorId`, `patientId` filters

**Current state**
Complete. Implemented in `src/repositories/user.repository.js`, `src/services/admin.service.js`, `src/controllers/admin.controller.js`, `src/validators/admin.validator.js`, and `src/routes/admin.routes.js`. Account deactivation immediately revokes all active refresh tokens for the user, rendering existing refresh tokens and logins invalid. Verified with full integration tests in `tests/admin/admin.test.js`.

**Engineering concepts learned**
- Admin scopes and read-only oversight
- Account lifecycle: deactivation invalidating sessions across JWT, refresh tokens, and authentication middleware
- Filter composition in queries

**Acceptance criteria**
- Only ADMIN can list/update users and view all appointments
- Deactivating a user immediately blocks login, all protected requests, **and** refresh (tokens revoked, not just checked)
- Re-activation is possible without data loss

---

## Milestone 15 — API Documentation (Swagger)

**Status:** ✅ Completed

**Goal**
Expose the implemented API as browsable OpenAPI documentation at `/api/docs`.

**What I need to implement**
- Embed OpenAPI 3.0 specification covering all endpoints, request/response bodies, authentication schemes, and error schemas
- Mount `swagger-ui-express` at `/api/docs` and serve raw JSON at `/api/docs.json`

**Current state**
Complete. Built comprehensive OpenAPI 3.0 specification in `src/docs/openapi.js` covering every endpoint from `docs/API.md` (auth, users, doctors, patients, specialties, availability, appointments, admin). Mounted in `src/app.js` and verified with integration tests in `tests/docs_and_security/docs_and_security.test.js`.

**Engineering concepts learned**
- OpenAPI/Swagger specification standards
- Serving browsable interactive documentation directly from the Express application

**Acceptance criteria**
- `GET /api/docs` renders the interactive Swagger UI
- `GET /api/docs.json` returns valid OpenAPI 3.0 JSON
- Every implemented endpoint appears with its contract matching `docs/API.md`

---

## Milestone 16 — Security Hardening & Production Readiness

**Status:** ✅ Completed

**Goal**
Make the app safe, secure, and deployable beyond localhost.

**What I need to implement**
- CORS policy: configurable via `CORS_ORIGIN` (defaults to `*`, customizable per environment)
- Security headers with `helmet` middleware
- Node `engines` declaration in `package.json` (`"node": ">=20.0.0"`)
- Graceful shutdown handling (`SIGTERM` & `SIGINT` signals closing HTTP server and disconnecting Prisma)

**Current state**
Complete. `helmet` and `cors` are integrated into `src/app.js`. Environment configuration validated via Zod schema in `src/config/index.js`. Graceful shutdown handles `SIGTERM` and `SIGINT` cleanly. Verified with integration tests in `tests/docs_and_security/docs_and_security.test.js`.

**Engineering concepts learned**
- Web security headers and HTTP CORS policies
- Process signal handling (`SIGTERM`/`SIGINT`) for graceful teardown of connection pools
- Node engine bounds and production configuration management

**Acceptance criteria**
- App runs cleanly with production headers and CORS policies
- Helmet security headers (`X-Content-Type-Options: nosniff`, etc.) are returned on HTTP responses
- Graceful shutdown cleanly disconnects Prisma on process termination

---

# Overall Project Progress

**Completed milestones (16 of 16 — 100% Complete):**
1. Project Foundation & Tooling ✅
2. Database Design & Prisma Setup ✅
3. Layered Architecture & Project Structure ✅
4. Validation & Centralized Error Handling ✅
5. Authentication & Session Management ✅
6. Authorization Layer ✅
7. Authentication Hardening ✅
8. Testing (Auth Focus & Integration Suite) ✅
9. Specialties Module ✅
10. Doctors Module ✅
11. Patients Module ✅
12. Availability & Scheduling ✅
13. Appointments & Booking ✅
14. Admin Module ✅
15. API Documentation (Swagger) ✅
16. Security Hardening & Production Readiness ✅

---

# Test Suite Status

All 175 integration tests pass across all 43 test suites in under 55 seconds against a real PostgreSQL test database.

```bash
npm test
# Result: 175 passed, 0 failed, 0 skipped
```

---

*This document tracks both the roadmap and the implementation state of each milestone; all 16 milestones are 100% completed.*