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
| 6 | Authorization Layer | 🟡 Partially completed |
| 7 | Authentication Hardening | ✅ Completed |
| 8 | Testing (Auth Focus) | ✅ Completed |
| 9 | Specialties Module (First Feature) | ✅ Completed |
| 10 | Doctors Module | ✅ Completed |
| 11 | Patients Module | ✅ Completed |
| 12 | Availability & Scheduling | ⬜ Not started |
| 13 | Appointments & Booking | ⬜ Not started |
| 14 | Admin Module | ⬜ Not started |
| 15 | API Documentation (Swagger) | ⬜ Not started |
| 16 | Security Hardening & Production Readiness | ⬜ Not started |

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
Complete. `prisma/schema.prisma` has all six models and three enums; two migrations exist (`20260814125914_init`, `20260819120649_add_refresh_tokens_and_lockout`); `src/lib/prisma.js` instantiates the client with the pg adapter; the toolchain mismatch (CLI 6.12 vs client 7.9.1) was fixed — `prisma` and `@prisma/client` are both pinned to `7.9.1`, and `validate`, `generate`, `migrate status`, and the running app all verify clean.

Note: two constraints are deliberately deferred to later milestones and documented in `docs/DATABASE.md`: the partial unique index on non-cancelled `Appointment.availability_id` (Milestone 13) and the `CHECK (end_time > start_time)` on `Availability` (Milestone 12).

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
Complete. The exact structure above exists; `src/errors/AppError.js` holds the error hierarchy; repositories follow the `(data, client = prisma)` transaction-friendly pattern; `docs/ARCHITECTURE.md` documents the design. `src/lib/logger.js` from the architecture doc does not exist — logging is implemented as a middleware (`src/middlewares/logging.middleware.js`), which is a small doc drift, not a gap.

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
Implemented and working: `src/middlewares/validate.middleware.js`, `src/middlewares/error.middleware.js`, `src/middlewares/logging.middleware.js`, `src/validators/auth.validator.js`, `src/validators/specialty.validator.js`, and `docs/VALIDATION_ERROR_HANDLING.md`.

**What remains**
None — the final open item was closed: Prisma errors are now mapped in `src/middlewares/error.middleware.js` (`P2002` → 409, `P2025` → 404, others → generic 500) via `Prisma.PrismaClientKnownRequestError` imported from the generated client. Verified against a real duplicate-key error and live HTTP requests (JSON 404s, JSON 500s, 400 validation details).

**Engineering concepts learned**
- Boundary validation vs. business-logic validation
- Error class hierarchies and centralized error formatting
- Zod parsing with transformed output
- Not leaking internal error details to clients

**Acceptance criteria**
- Every endpoint rejects malformed input with 400 + per-field `errors`
- All auth errors return 401, permission errors 403, duplicates 409, not-found 404
- Production 5xx responses contain no internal error details
- Prisma `P2002` (duplicate email) returns 409, not 500

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
Implemented, verified, and fixed across two review rounds. The current code in `src/services/auth.service.js`, `src/controllers/auth.controller.js`, `src/routes/auth.routes.js`, `src/middlewares/auth.middleware.js`, `src/repositories/user.repository.js`, and `src/repositories/refresh-token.repository.js` includes: correct `expires_at` field, `refresh()` returning `{ accessToken, refreshToken, user }`, `requireRole` calling `next()` on success, revoked-before-expired reuse detection ordering, atomic `failed_login_count` increment, and `sub` validation in the auth middleware. All four auth endpoints work end-to-end.

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

**Status:** 🟡 Partially completed

**Goal**
Role-based access control (PATIENT / DOCTOR / ADMIN) enforced by middleware, with ownership checks in the service layer, applied across all protected routes.

**What I need to implement**
- A `requireRole(...roles)` middleware factory that returns 403 when `req.user.role` is not allowed (already done)
- Apply `authenticate` + `requireRole` to every protected route as features are built (doctors, patients, availability, appointments, admin)
- Ownership checks in services where rules depend on data the middleware can't see (e.g. "a patient can only cancel their own appointment", "a doctor can only manage their own availability")
- Verify the full authorization matrix from `docs/API.md` once all features exist

**Current state**
The middleware exists and is correct (`src/middlewares/role.middleware.js`, named `requireRole` and calling `next()` on success). It is now applied on every feature route built since: specialties admin endpoints, `PATCH /doctors/me`, and `PATCH /patients/me` all compose `authenticate` → `requireRole(...)`, and ownership checks live in their services. What remains is verifying the complete authorization matrix from `docs/API.md` once features 12–14 exist.

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
- **Concurrent-reuse family revocation:** in `refresh()`, when `revokeIfActive` returns `count === 0`, the current fix calls `revokeFamily` *inside* the transaction and then throws — Prisma rolls the revocation back, so the family survives. Restructure so the family revocation runs **outside** the transaction (e.g. flag the reuse, exit the transaction, revoke, then throw), making concurrent reuse behave like sequential reuse.
- **Rate limiting** on `/auth/login`, `/auth/register`, `/auth/refresh` (in-memory limiter is fine at this scale) so the lockout isn't the only brute-force defense.
- **Refresh-token input bounds:** cap `refreshToken` length in the validator (e.g. max 256) — arbitrary-length strings currently pass `min(1)` only.
- **Client-side token storage guidance:** document (in the API docs) that tokens returned in the response body must not live in `localStorage` without acknowledging the XSS exposure; the httpOnly-cookie alternative is a deliberate tradeoff, not a change.

**Engineering concepts learned**
- Transaction rollback semantics (writes inside a rolled-back transaction do not persist)
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
- Add a test runner (e.g. `node:test` + `supertest`, or vitest) and a `npm test` script
- Test database strategy: isolated test database + `prisma migrate deploy` in test setup
- Integration tests for:
  - Register: happy path (patient + doctor with specialty), duplicate email → 409, missing specialtyId for DOCTOR → 400, response contains no token/hash
  - Login: happy path, wrong password, unknown email, locked account, deactivated account — all identical 401s; lockout after 5 failures; unlock after 15 minutes (inject time or shrink duration)
  - Refresh: rotation returns a new usable pair, old token dead, reuse of revoked token revokes the family, expired token rejected, deactivated user rejected
  - Concurrent refresh with the same token (tests Milestone 7's fix)
  - Logout: revokes family; tokens from another user rejected
  - Auth middleware: missing/malformed/expired token → 401; deactivated user → 401
  - Role middleware: correct role passes, wrong role → 403, missing user → 403
- A CI note: the README's "Future Improvements" already calls for basic CI (lint + test) on PRs

**What was implemented**
- Test stack: Node's built-in `node:test` runner + `node:assert/strict` + Supertest, hitting the real Express app and a real PostgreSQL test database (`clinic_booking_test`) — Prisma/database behavior is not mocked anywhere.
- `.env.test` defines the dedicated test environment (test `DATABASE_URL`, throwaway JWT secret, raised rate-limit ceilings). It is committed because it contains only local defaults.
- Each test file runs `prisma migrate deploy` against the test database and truncates every table first; users are created with unique random emails so no test depends on execution order or on a previous run's state. Files run serially (`--test-concurrency=1`) so cleanup cannot race.
- Deterministic time control without waiting: expired access tokens are signed directly with a past expiry, expired refresh tokens are inserted as rows with past `expires_at`, and lockout expiry is simulated by setting `locked_until` into the past in the test database.
- Tests: register (patient/doctor happy paths, duplicate email 409, missing specialtyId 400, unknown specialtyId 404, response-contract/no-leak checks), login (valid credentials, wrong password, unknown email, deactivated account — identical 401s), lockout (5 failures → locked → correct password rejected while locked → unlock after simulated expiry), refresh (rotation issues a usable pair, old token dead, reuse revokes the whole family including the legitimate new token, expired rejected, deactivated user rejected, unknown token 401), concurrent refresh (`Promise.all` double-spend: exactly one success + one 401 and the entire family ends revoked — verified in the DB and end-to-end through the API), logout (204 + family revoked, rotated chain fully killed, another user's token rejected without collateral damage), authenticate middleware (missing/malformed/expired/deactivated → 401, valid proceeds) exercised through the real protected `/auth/logout` route, and role middleware (correct role passes, wrong role 403, missing `req.user` 403).
- Minimal production adjustments made for testability (no behavior changes): `src/app.js` exports the app and only listens when executed directly (avoids port conflicts across test processes); rate-limiter points became env-configurable (`RATE_LIMIT_*_MAX`) with defaults identical to the previous hardcoded values, because all integration requests arrive from one IP and would otherwise exhaust the documented limits mid-suite.
- The suite caught one latent production bug immediately: `role.middleware.js` imported `../errors/AppError` without the `.js` extension, which cannot resolve under ESM — fixed.

**Engineering concepts learned**
- Integration testing of HTTP flows against a real database
- Testing security behavior (lockout, rotation, reuse) — not just happy paths
- Concurrency tests for token races
- Test isolation and deterministic time control

**Acceptance criteria**
- ✅ `npm test` runs the full suite against a test database
- ✅ All four auth endpoints covered on happy and failure paths
- ✅ A concurrent-refresh test exists and passes
- ✅ Re-running the suite is deterministic (isolated DB state)

---

## Milestone 9 — Specialties Module (First Feature)

**Status:** ✅ Completed

**Goal**
The first complete feature end-to-end — a small admin-managed lookup table that exercises every layer and the authorization middleware for the first time.

**What I need to implement**
- `GET /specialties` (public, with `page`/`limit`/`search` per `docs/API.md` and `docs/VALIDATION_ERROR_HANDLING.md` patterns)
- `POST /specialties` (ADMIN), `PATCH /specialties/:id` (ADMIN), `DELETE /specialties/:id` (ADMIN, 409 if a doctor is still assigned)
- Routes → controller → service → repository for specialties; wire into `app.js`
- Apply `authenticate` + `requireRole('ADMIN')` to the admin routes
- Service-level duplicate-name check plus 409; handle the `P2002` race via the Milestone 4/7 error mapping
- `specialty.repository.js` additions: `findAll` (paginated), `findByName`, `update`, `remove`

**Current state**
Complete. Implemented end-to-end; the "what remains" items below were closed by the specialties routes/tests commit:

- `src/repositories/specialty.repository.js`: `findById`, `findByName`, `findAll` (pagination + optional case-insensitive `contains` name search shared by `findMany` and `count`, ordered by `name` ascending), `createSpecialty`, `updateSpecialty(id, data)`, `deleteSpecialty(id)` — all transaction-friendly via the `(arg, client = prisma)` pattern.
- `src/services/specialties.service.js`: `list` (returns `{ specialties, total, meta }` with `page`/`limit`/`total`/`totalPages`), `create` (duplicate-name check → 409 `"Specialty with this name already exists"`), `update` (404 when missing; renaming to its own current name succeeds; a name owned by a different specialty → 409), `getById` (specialty or 404), `remove` (404 when missing; 409 while doctors are still assigned).
- `src/controllers/specialties.controller.js`: thin handlers for all five operations (`201` create, `200` list/update/get, `204` delete, errors forwarded to the centralized handler).
- `src/routes/specialty.routes.js`: `GET /specialties` and `GET /specialties/:id` public (validator only); `POST /specialties`, `PATCH /specialties/:id`, `DELETE /specialties/:id` wired `authenticate` → `requireRole('ADMIN')` → `validate(schema)`. Mounted in `app.js`.
- Error middleware: `P2003` → 409 added alongside the existing `P2002` → 409 and `P2025` → 404 mappings, so both race backstops (unique name, FK on delete) resolve to 409.
- Integration tests: `tests/specialties/specialties.test.js` (anonymous list with pagination/search semantics, detail + 404/400, ADMIN create with duplicate 409/validation 400s, rename incl. self-rename and 409/404 paths, delete-in-use 409, full 401/403 role matrix).

The implementation adds `GET /specialties/:id` (public) beyond the four originally planned endpoints; `docs/API.md` documents it.

**What remains**
None — acceptance criteria are met.

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
- `GET /doctors` (public): paginated list of `{ id, fullName, specialty, bio }` with optional `specialty` filter (name or id)
- `GET /doctors/:id` (public): detail view, 404 when missing
- `PATCH /doctors/me` (DOCTOR): update own `bio` / `specialtyId`
- Repository: `findMany` with specialty filter + pagination and count, `findById` with specialty included, `update`
- Doctor profile updates must go through the owning `User` (the doctor is identified via `req.user` → their `Doctor` row)
- Add `GET /users/me` (any role) returning the user merged with their doctor/patient profile, or implement it in the Patients milestone — decide and document which milestone owns it

**Current state**
Complete. Implemented end-to-end following the specialties pattern:

- `src/routes/doctors.routes.js`: `GET /doctors` and `GET /doctors/:id` are public (validator only); `PATCH /doctors/me` is wired `authenticate` → `requireRole('DOCTOR')` → `validate(updateDoctorSchema)`. Mounted in `app.js`.
- `src/repositories/doctor.repository.js`: added `findMany` (optional specialty filter resolved to a relation `where`, `skip`/`take`, parallel count), `findById` (includes only the owner's `full_name` and the specialty `id`/`name`), `findByUserId`, and `update`. Only public fields are selected — no email, password hash, or auth state ever leaves the repository for these queries.
- `src/services/doctors.service.js`: `list` (returns `{ doctors, meta }` with `page`/`limit`/`total`/`totalPages`), `getById` (404 when missing), `updateOwnProfile(userId, { bio, specialtyId })`. Rows are mapped to the documented public shape `{ id, fullName, specialty: { id, name }, bio }` in the service before reaching a controller.
- `src/controllers/doctors.controller.js` + `src/validators/doctor.validator.js`: thin handlers; Zod schemas follow the specialty conventions (pagination defaults 1/10 capped at 100, UUID params, optional trimmed non-empty `bio` ≤ 1000 chars, optional `specialtyId` UUID).
- Integration tests: `tests/doctors/doctors.test.js` (anonymous listing, exact pagination slices/metadata, filtering by name and id, detail + 404/400, self-update persistence, unknown-specialtyId 404, validation 400s, role matrix 401/403, cross-doctor ownership).

**Ownership:** `PATCH /doctors/me` resolves the Doctor row via `doctorRepo.findByUserId(req.user.id)` — the id comes from the verified token (and the DB-active recheck in `authenticate`), never from client input. There is no route accepting a doctor id for updates, so another doctor's profile is unreachable by construction.

**`GET /users/me` decision:** owned by **Milestone 11 (Patients Module)**, matching this roadmap's existing assignment of the endpoint. Its substance is merging the base account with the *role-specific* profile — work that lands with the patient profile in Milestone 11 anyway — and nothing in the Doctors module depends on it, so implementing it here would duplicate Milestone 11 scope without serving any M10 endpoint.

**Engineering concepts learned**
- Public read vs. authenticated write on the same resource
- The "own profile" pattern: `req.user` → profile row → service-level ownership
- Filtering + pagination queries with Prisma `include`

**Acceptance criteria**
- ✅ Anonymous users can browse the doctor directory
- ✅ A DOCTOR can update only their own profile; other roles get 403
- ✅ Specialty filter works by name and by id
- ✅ Pagination metadata matches `docs/API.md`

---

## Milestone 11 — Patients Module

**Status:** ✅ Completed

**Goal**
Patient self-service profile management and the merged `/users/me` endpoint.

**What I need to implement**
- `PATCH /patients/me` (PATIENT): update own `fullName`, `phone`, `dateOfBirth`
- `GET /users/me` (any role): authenticated user + their `Doctor` or `Patient` profile
- Repository additions for `patient.update` and user-with-profile lookup
- Validation for the date-of-birth field (date parsing/format)

**Current state**
Complete. Implemented end-to-end following the doctors pattern:

- `src/routes/patients.routes.js`: `PATCH /patients/me` wired `authenticate` → `requireRole('PATIENT')` → `validate(updatePatientSchema)`. `src/routes/users.routes.js`: `GET /users/me` wired with `authenticate` only (any role). Both mounted in `app.js`.
- `src/repositories/patient.repository.js`: added `findByUserId` (ownership resolution) and `update`. `src/repositories/user.repository.js`: added `findByIdWithProfile` — one query returning only owner-safe account fields plus the Doctor row (with specialty id/name) and/or Patient row.
- Field placement per schema: `fullName`/`phone` live on `"User"`, `dateOfBirth` on `"Patient"`. The service writes both through one nested Prisma update (`patient.update { data: { date_of_birth, user: { update } } }`), which is transactional, so the account and profile can never be half-updated. Omitted fields are untouched; an empty body is a valid no-op.
- `src/services/patients.service.js`: `updateOwnProfile(userId, {...})` resolves the Patient via `findByUserId(req.user.id)` and throws 404 `Patient not found` when the profile row is missing. `src/services/users.service.js`: `getCurrentUser(userId)` plus the shared `mapMergedProfile` mapper used by both endpoints, so `/patients/me` responses and `/users/me` responses speak one shape: account fields (`id, email, fullName, phone, role, isActive, createdAt, updatedAt`) + `patient: { id, dateOfBirth }` for PATIENT, `doctor: { id, specialty: { id, name }, bio }` for DOCTOR, no profile key for ADMIN. A role whose profile row is missing surfaces as 404; sensitive fields (password hash, lockout state, tokens) never leave the repository select.
- `src/validators/patient.validator.js`: optional trimmed non-empty `fullName` ≤ 150, trimmed `phone` ≤ 30 (mirrors registration), and a date-only `dateOfBirth`: strictly `YYYY-MM-DD`, must parse to a real calendar date (rejects `1990-02-30`), transformed to a UTC-midnight `Date` at the boundary so the `@db.Date` column stores exactly that calendar day regardless of server timezone; serialized back out as `YYYY-MM-DD`.
- Integration tests: `tests/patients/patients.test.js` (self-update persistence across User+Patient, partial updates, empty-body no-op, exact calendar-date persistence without timezone drift, malformed dates/values 400s, unknown-field stripping, 401/403 role matrix, cross-patient ownership + forged-id route absence, missing-profile 404s, `/users/me` per-role shapes, sensitive-field leak scan, PATCH/GET shape agreement).

**Ownership:** `PATCH /patients/me` resolves the Patient row via `patientRepo.findByUserId(req.user.id)` — the id comes from the verified token (and the DB-active recheck in `authenticate`), never from client input. There is no route accepting a patient id for updates, so another patient's profile is unreachable by construction.

**Engineering concepts learned**
- Merging base account data with role-specific profile data in one response shape
- Same "own profile" ownership pattern as doctors, applied to patients
- Nested Prisma writes as an implicit transaction across User + Patient rows
- Date-only validation and timezone-safe storage (`YYYY-MM-DD` ↔ UTC-midnight `Date` ↔ Postgres `DATE`)

**Acceptance criteria**
- ✅ A PATIENT updates only their own profile; other roles get 403
- ✅ `GET /users/me` returns role-appropriate profile fields

---

## Milestone 12 — Availability & Scheduling

**Status:** ⬜ Not started

**Goal**
Doctors define individual bookable slots; patients can view a doctor's open slots; slot overlap is prevented.

**What I need to implement**
- `GET /doctors/:doctorId/availability` (public): list `AVAILABLE` slots, optional `from`/`to` date filter
- `POST /doctors/me/availability` (DOCTOR): create a slot (`date`, `startTime`, `endTime`)
- `DELETE /doctors/me/availability/:id` (DOCTOR): delete own unbooked slot (403 if not owned, 409 if booked)
- Overlap rule per `docs/API.md`: same doctor+date, reject when `newStart < existingEnd && newEnd > existingStart`; adjacent slots allowed
- Enforce `end_time > start_time` at validation, service, and database level — add the deferred `CHECK` constraint migration
- Interpret dates/times in the clinic timezone `Africa/Cairo` (no multi-timezone support, per PRD)
- Availability validator (`src/validators/availability.validator.js` — not yet created)

**Engineering concepts learned**
- Service-level conflict detection against database constraints
- Timezone-bound date/time handling
- Ownership checks on sub-resources (availability belongs to a doctor)
- Querying ranges (`from`/`to`) with Prisma

**Acceptance criteria**
- Overlapping slots return 409; adjacent slots are allowed
- A doctor cannot delete another doctor's slot (403) or a booked slot (409)
- `end_time > start_time` is rejected at validation, and the DB CHECK constraint exists in a migration
- Only `AVAILABLE` slots appear in public listings

---

## Milestone 13 — Appointments & Booking

**Status:** ⬜ Not started

**Goal**
The core business flow: patients book available slots, cancel their own appointments, and doctors manage appointment status — with double-booking prevented at the database level.

**What I need to implement**
- Replace the current unique `Appointment.availability_id` constraint with the deferred **partial unique index** (`WHERE status <> 'CANCELLED'`) so cancelled history is retained and a released slot can be rebooked
- `POST /appointments` (PATIENT): atomically claim an `AVAILABLE` slot → set it `BOOKED` → create the appointment — all in one `$transaction`
- `GET /appointments/me` (PATIENT or DOCTOR): own appointments, `page`/`limit`/`status` filter
- `GET /appointments/:id` (PATIENT/DOCTOR/ADMIN): 403 for non-owners (except ADMIN), 404 when missing
- `PATCH /appointments/:id/status` (DOCTOR own appointments, or PATIENT cancelling own): controlled transitions `PENDING → CONFIRMED → COMPLETED`, `CANCELLED` only from `PENDING`/`CONFIRMED`; past appointments immutable except doctor marking `COMPLETED`
- Cancellation: set status `CANCELLED` + release the slot back to `AVAILABLE` in the same transaction
- The partial unique index is the DB backstop if booking requests race

**Engineering concepts learned**
- Transactional state changes spanning two tables (slot + appointment)
- Database-level race protection (partial unique index) vs. app-level checks
- Status-lifecycle state machines and their validation
- History retention vs. reusability (cancelled rows stay, slots reopen)

**Acceptance criteria**
- Two concurrent bookings of the same slot result in exactly one success
- Cancelling releases the slot; the same slot can be booked again later
- Invalid transitions (e.g. cancelling a COMPLETED appointment) return 409
- A patient sees only their own appointments; a doctor only theirs; ADMIN sees all

---

## Milestone 14 — Admin Module

**Status:** ⬜ Not started

**Goal**
Administrative oversight: user/account management and read access to all appointments.

**What I need to implement**
- `GET /admin/users` (ADMIN): paginated list with `role` / `isActive` filters
- `PATCH /admin/users/:id` (ADMIN): update `fullName` / `phone` / `isActive` for patient and doctor accounts
- **Wire deactivation to sessions:** when `isActive` is set to `false`, call `refreshTokenRepo.revokeAllForUser` (the function already exists) so no refresh tokens survive deactivation — this is the integration the PRD explicitly expects
- `GET /admin/appointments` (ADMIN): read-only oversight with `status`/`doctorId`/`patientId` filters
- Admin routes protected with `requireRole('ADMIN')`; admin accounts remain script-created only (no API endpoint)

**Engineering concepts learned**
- Admin scopes and read-only oversight
- Account lifecycle: deactivation must invalidate sessions at every layer
- Filter composition in queries

**Acceptance criteria**
- Only ADMIN can list/update users and view all appointments
- Deactivating a user immediately blocks login, all protected requests, **and** refresh (tokens revoked, not just checked)
- Re-activation is possible without data loss

---

## Milestone 15 — API Documentation (Swagger)

**Status:** ⬜ Not started

**Goal**
Expose the implemented API as browsable OpenAPI documentation at `/api/docs` (promised in `docs/API.md` and README).

**What I need to implement**
- Add swagger tooling (e.g. `swagger-jsdoc` + `swagger-ui-express`) with JSDoc annotations on the route definitions
- Document all endpoints, request/response shapes, auth requirements, and the error format
- Protect the docs route or keep it public as appropriate for the environment

**Engineering concepts learned**
- OpenAPI/Swagger specification and generating docs from code
- Keeping documentation in sync with implementation

**Acceptance criteria**
- `GET /api/docs` renders the interactive UI
- Every implemented endpoint appears with its contract from `docs/API.md`

---

## Milestone 16 — Security Hardening & Production Readiness

**Status:** ⬜ Not started

**Goal**
Make the app safe and deployable beyond localhost.

**What I need to implement**
- CORS policy (PRD requires "sane CORS") — explicit allowlist, no permissive defaults
- Security headers (`helmet`)
- Verify production behavior: `NODE_ENV=production` hides 5xx details (already implemented in the error middleware), `create-admin` refuses to run (already implemented)
- Declare Node `engines` (the app imports the generated Prisma client's `.ts` file — it requires a Node version with type stripping enabled)
- Graceful shutdown (close HTTP server + `prisma.$disconnect()`)
- Deployment basics: `prisma migrate deploy` in the release flow, process manager/container, secrets via environment
- Optional: JWT `issuer`/`audience` claims, explicit algorithm pin, audit logging, request logging without sensitive data (already true)

**Engineering concepts learned**
- Production vs. development behavior
- Web security headers and CORS
- Deployment and release workflows (migrations as part of deploys)
- Secrets management and environment separation

**Acceptance criteria**
- App runs with `NODE_ENV=production` and exposes no internal error details
- CORS and security headers configured explicitly
- `migrate deploy` is part of the documented release flow
- Graceful shutdown on SIGTERM

---

# Overall Project Progress

**Completed milestones (11):**
1. Project Foundation & Tooling
2. Database Design & Prisma Setup
3. Layered Architecture & Project Structure
4. Validation & Centralized Error Handling
5. Authentication & Session Management
7. Authentication Hardening
8. Testing (Auth Focus)
9. Specialties Module
10. Doctors Module
11. Patients Module
(plus the B9 toolchain fix, which closed Milestone 2's last open item)

**Partially completed (1):**
6. Authorization Layer — middleware done (and unit-tested); applied to specialties/doctors/patients admin routes so far, to be verified against the full matrix once all features exist

**Current milestone:** Milestone 11 — Patients Module ✅ Completed (`PATCH /patients/me` self-service profile updates with transactional User+Patient writes, and the merged `GET /users/me` endpoint owning the decision deferred from Milestone 10).

**Next milestone (recommended):** Milestone 12 — Availability & Scheduling.

**Remaining major milestones (11 completed, 5 remaining):**
12. Availability & Scheduling
13. Appointments & Booking
14. Admin Module
15. API Documentation (Swagger)
16. Security Hardening & Production Readiness

---

# Recommended Next Step

**Work on Milestone 12 — Availability & Scheduling next.**

Why:

1. **Milestones 7 and 8 are complete.** The auth system is hardened (rate limiting, rotation with reuse detection, lockout) and locked in by a deterministic integration test suite (`npm test`) covering register → login → refresh → logout, lockout/unlock, and the concurrent-refresh race.
2. **Every future feature builds on the auth system.** Milestones 9–14 all assume the token lifecycle and role middleware are trustworthy. With the suite in place, any regression in that foundation fails loudly before features ship. The README lists "basic CI (lint + test)" as the planned follow-up; `npm test` is ready to be wired into CI as-is.
3. **The first three features are done.** Specialties, Doctors, and Patients exercise every layer and both ownership patterns (`req.user` → profile row), so Milestone 12 can build doctor-owned sub-resources on proven conventions — including the deferred `CHECK (end_time > start_time)` migration.

---

*This document is a roadmap only. It describes planned engineering work; none of it has been implemented as part of writing this file.*