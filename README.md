# Clinic Booking API

## Overview

A production-ready backend application for managing clinic appointment scheduling. Patients browse doctors, check availability, and book or cancel appointments. Doctors manage their availability and the status of their appointments. Admins manage accounts, doctors, user active states, and specialties. Built with Node.js, Express.js, and PostgreSQL via Prisma ORM.

> **Status:** All 16 engineering milestones are **100% complete**. Includes centralized boundary validation and error handling, secure authentication (registration, JWT access tokens, rotating opaque refresh tokens, logout, login lockout), role-based access control, specialties management, public doctor directory, self-service patient and doctor profiles with merged `/users/me`, doctor-owned availability scheduling with overlap prevention, transactional appointment booking with atomic slot claiming and partial unique index double-booking prevention, administrative oversight and user deactivation with automatic token revocation, interactive Swagger/OpenAPI documentation at `/api/docs`, and production security hardening with Helmet and CORS.

## Features

- **Authentication & Security:** JWT access tokens (15m), rotating refresh tokens (30d) hashed at rest (SHA-256), token family reuse detection with automatic family revocation, 5-attempt account login lockout (15m), and rate limiting.
- **Authorization & RBAC:** Enforced role-based access control (PATIENT, DOCTOR, ADMIN) with service-level resource ownership verification.
- **Specialties Management:** Public browsing and Admin CRUD for medical specialties.
- **Doctor Directory & Profiles:** Public doctor browsing by specialty/ID and self-service profile updates.
- **Patient Profiles & Account Overview:** Patient self-service profile management and unified `/users/me` endpoint.
- **Availability & Scheduling:** Doctor-managed availability slots with strict overlap prevention, date-range filtering, and PostgreSQL `CHECK (end_time > start_time)` database constraint.
- **Appointments & Booking:** Atomic slot claiming inside interactive transactions, state machine status lifecycle (`PENDING → CONFIRMED → COMPLETED` / `CANCELLED`), past appointment immutability in clinic time (`Africa/Cairo`), transactional cancellation slot releasing, and PostgreSQL partial unique index double-booking prevention (`WHERE status <> 'CANCELLED'`).
- **Admin Management:** Administrative oversight of all users with role/active filtering, user detail updates, account deactivation with instant session revocation (`refreshTokenRepo.revokeAllForUser`), and global read-only appointment oversight.
- **Interactive Documentation:** Live OpenAPI 3.0 documentation served via Swagger UI at `/api/docs`.
- **Security Hardening & Production Readiness:** Helmet HTTP security headers, configurable CORS policy, Zod environment configuration validation, Node `>=20.0.0` engine enforcement, and graceful shutdown signal handling (`SIGTERM`/`SIGINT`).

## Tech Stack

```text
Node.js (>=20.0.0)
Express.js (v5)
JavaScript (ESM)
PostgreSQL
Prisma ORM (v7) with Pg Driver Adapter
Zod
JWT (jsonwebtoken)
bcrypt
cors & helmet
swagger-ui-express
supertest & node:test
```

## Architecture

A layered Express application: routes → controllers → services → repositories → Prisma → PostgreSQL, with centralized authentication, authorization, validation, logging, and error-handling middleware. Full details, including the request lifecycle and layer responsibilities, are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Database

PostgreSQL, accessed through Prisma ORM using the `@prisma/adapter-pg` driver adapter. The schema uses PascalCase table names (`"User"`, `"Specialty"`, `"Doctor"`, `"Patient"`, `"Availability"`, `"Appointment"`, `"RefreshToken"`). Cancelled appointments are retained as history, and a PostgreSQL partial unique index enforces one non-cancelled appointment per availability slot at the database level. Full schema decisions are in [`docs/DATABASE.md`](docs/DATABASE.md).

## API Documentation

Interactive Swagger/OpenAPI documentation is available at:
- **Swagger UI:** `/api/docs`
- **OpenAPI 3.0 JSON Spec:** `/api/docs.json`

The written endpoint-by-endpoint specification — request/response shapes, validation rules, and the authorization matrix — is in [`docs/API.md`](docs/API.md).

## Project Structure

```text
src/
├── config/             # Zod environment configuration
├── controllers/        # Express HTTP handlers
├── docs/               # OpenAPI 3.0 specification definition
├── errors/             # AppError hierarchy and HTTP mappings
├── lib/                # Prisma client & database singleton
├── middlewares/        # Auth, RBAC, validate, logging, error handling
├── repositories/       # Thin Prisma wrappers with optional transaction client
├── routes/             # Express API routes
├── services/           # Business logic & state machine rules
├── utils/              # JWT, hash, and clinic-time calculations
├── validators/         # Zod boundary validation schemas
└── app.js              # Application entry point and server setup
tests/
├── admin/              # Integration tests for admin management endpoints
├── appointments/       # Integration tests for booking, status, and concurrency
├── auth/               # Integration tests for authentication and session lifecycle
├── availability/       # Integration tests for availability and slot scheduling
├── doctors/            # Integration tests for doctor directory and profile updates
├── docs_and_security/  # Integration tests for Swagger docs and Helmet/CORS security headers
├── helpers/            # Test DB setup, teardown, and auth request helpers
├── middleware/         # Integration tests for authentication and role authorization
├── patients/           # Integration tests for patient profiles and /users/me
└── specialties/        # Integration tests for specialties CRUD endpoints
```

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the values
3. Install dependencies: `npm install`
4. Start PostgreSQL locally
5. Run Prisma migrations: `npx prisma migrate deploy`
6. Start the development server: `npm run dev`

## Environment Variables

```text
DATABASE_URL=postgresql://user:password@localhost:5432/clinic_booking
PORT=3000
JWT_SECRET=<at least 32 characters>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CORS_ORIGIN=*
```

Optional rate-limit tuning (defaults shown):

```text
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_REGISTER_MAX=5
RATE_LIMIT_REFRESH_MAX=20
```

## Creating the First Admin Account

Admin accounts are never created through the public API. Use the local bootstrap script:

```bash
ADMIN_EMAIL=admin@clinic.test ADMIN_PASSWORD='a-strong-password' ADMIN_FULL_NAME='Clinic Admin' npm run create-admin
```

The script refuses to run in production (`NODE_ENV=production`) and requires the three variables above.

## Running the Application

```bash
# install dependencies
npm install

# run in development mode with nodemon
npm run dev

# start in production mode
npm start

# verify Prisma can connect to the configured database
npm run test:db
```

## Database Setup & Migrations

Schema changes are managed with Prisma migrations:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

`npx prisma studio` can be used locally to inspect data during development.

## Automated Integration Testing

The project features a comprehensive test suite of 175 non-mocked integration tests running with Node's built-in runner (`node:test` + `node:assert/strict`) and Supertest against a real PostgreSQL **test database** (`clinic_booking_test`).

### Running tests

```bash
# full suite (automatically provisions test DB, applies migrations, and runs 175 integration tests)
npm test

# run a specific test file
node --env-file=.env.test --test tests/admin/admin.test.js

# run tests matching a pattern
node --env-file=.env.test --test --test-name-pattern="deactivating revokes refresh tokens"
```

### Test Isolation Strategy

- The development database (`clinic_booking`) and test database (`clinic_booking_test`) are isolated. `npm test` never touches development data.
- Before each test suite runs, tables are truncated (`TRUNCATE TABLE ... RESTART IDENTITY CASCADE`).
- Tests construct isolated fixture data with random UUID identifiers.
- Concurrency test cases test real HTTP double-spends (`Promise.all`) to verify database row locking and unique constraints.
- Time-dependent tests (e.g. past appointments or token expiries) manipulate mock durations or past dates deterministically.

## CI/CD Pipeline Readiness

The test suite is fully configured for automated CI/CD pipelines (e.g. GitHub Actions):

```bash
npm test
```

Running `npm test` executes all 175 tests in under 55 seconds with zero external mocking requirements.
