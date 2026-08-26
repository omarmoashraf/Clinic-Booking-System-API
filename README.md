# Clinic Booking API

## Overview

A backend application for managing clinic appointment scheduling. Patients browse doctors, check availability, and book or cancel appointments. Doctors manage their availability and the status of their appointments. Admins manage accounts and specialties. Built with Node.js, Express.js, and PostgreSQL via Prisma.

> Status: Foundation complete with centralized validation and error handling; authentication hardened (registration, JWT login, rotating refresh tokens, logout, login lockout). Domain features implemented: specialties management, doctor directory and self-service profiles, patient profiles with the merged `/users/me`, doctor-owned availability slots with overlap prevention, and the core appointments flow — booking with atomic slot claiming, cancellation that releases slots, controlled status transitions, and double-booking prevented by a partial unique index at the database level. Admin management is planned but not implemented yet.

## Planned Features

- Role-based authorization (Patient / Doctor / Admin)
- Doctor profiles and specialties
- Doctor-managed availability slots
- Appointment booking with double-booking prevented at the database level
- Appointment status lifecycle (pending → confirmed → completed, or cancelled)
- Admin management of users, doctors, and specialties
- Swagger/OpenAPI documentation

## Tech Stack

```text
Node.js
Express.js
JavaScript
PostgreSQL
Prisma
Zod
JWT (jsonwebtoken)
bcrypt
```

Swagger and Docker are planned additions, not current dependencies or features.

## Architecture

A layered Express application: routes → controllers → services → repositories → Prisma → PostgreSQL, with centralized authentication, authorization, validation, and error-handling middleware. Full details, including the request lifecycle and the responsibility of each layer, are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Database

PostgreSQL, accessed through Prisma. The schema uses Prisma's quoted PascalCase table names (`"User"`, `"Specialty"`, `"Doctor"`, `"Patient"`, `"Availability"`, and `"Appointment"`). Cancelled appointments are retained as history, and a PostgreSQL partial unique index enforces one non-cancelled appointment per availability slot at the database level. Full schema decisions are in [`docs/DATABASE.md`](docs/DATABASE.md).

## API Documentation

The full endpoint-by-endpoint specification — request/response shapes, validation rules, and the authorization matrix — is in [`docs/API.md`](docs/API.md). Once implemented, the same API will be browsable live via Swagger at `/api/docs`.

## Project Structure

```text
src/
├── config/
├── middlewares/
├── routes/
├── controllers/
├── services/
├── repositories/
├── validators/
├── errors/
├── utils/
├── lib/
└── app.js
tests/
├── helpers/       # test DB setup + auth request helpers
├── auth/          # integration tests for the auth endpoints
├── specialties/   # integration tests for the specialties endpoints
├── doctors/       # integration tests for the doctors endpoints
├── patients/      # integration tests for the patients endpoints
├── availability/  # integration tests for the availability endpoints
├── appointments/  # integration tests for booking, status, and concurrency
└── middleware/    # authenticate / role middleware tests
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what belongs in each folder.

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the values (see Environment Variables)
3. Install dependencies
4. Start PostgreSQL locally
5. Run Prisma migrations
6. Start the development server

## Environment Variables

```text
DATABASE_URL=postgresql://user:password@localhost:5432/clinic_booking
PORT=3000
JWT_SECRET=<at least 32 characters>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
```

Optional rate-limit tuning (defaults shown; see docs/API.md for the documented policy):

```text
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_REGISTER_MAX=5
RATE_LIMIT_REFRESH_MAX=20
```

Authentication details and decisions (token lifetimes, rotation, reuse detection, lockout policy, anti-enumeration) are documented in [`docs/API.md`](docs/API.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Creating the First Admin Account

Admin accounts are never created through the API. Use the local bootstrap script:

```bash
ADMIN_EMAIL=admin@clinic.test ADMIN_PASSWORD='a-strong-password' ADMIN_FULL_NAME='Clinic Admin' npm run create-admin
```

The script refuses to run in production and requires the three variables above.

## Running the Application

```bash
# install dependencies
npm install

# run in development mode
npm run dev

# start in production mode
npm start

# verify Prisma can connect to the configured database
npm run test:db
```

## Database Setup

Schema changes are managed with Prisma migrations:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

`npx prisma studio` can be used locally to inspect data during development.

## Verification and Testing

`npm run test:db` is a database connectivity smoke check, not an automated test suite.

Automated integration tests live in `tests/` and run with Node's built-in runner
(`node:test` + `node:assert/strict`) and Supertest against the real Express app and a
real PostgreSQL **test database** — no mocking of Prisma or the database.

### Configuring the test database

The test environment is defined by `.env.test` (committed; contains only local defaults
and a throwaway JWT secret). Its `DATABASE_URL` points at a dedicated database,
`clinic_booking_test`, which **must differ from the development database**. If you use
different local PostgreSQL credentials, edit `.env.test` accordingly.

No manual step is needed: on every run the suite creates the test database if it is
missing (requires a role with the CREATEDB privilege) and applies migrations.

### Running tests

```bash
# full suite (creates DB if needed + prisma migrate deploy, then all tests)
npm test

# a single test file
node --env-file=.env.test --test tests/auth/login.test.js

# a single test by name (substring match)
node --env-file=.env.test --test --test-name-pattern="reuse detection"
```

### How the test database stays isolated

- The dev database (`clinic_booking`) and test database (`clinic_booking_test`) are
  separate databases on the same PostgreSQL instance; `npm test` never touches the dev data.
- Before each test file runs, migrations are applied with `prisma migrate deploy` and
  **every table is truncated**, so leftover state from previous runs cannot affect results.
- Every test creates its own users via unique random emails, so tests do not depend on
  execution order.
- Test files run one at a time (`--test-concurrency=1`) so their cleanup steps cannot
  interfere with each other.
- Time-dependent behavior is handled deterministically instead of waiting: expired access
  tokens are signed directly with a past expiry, expired refresh tokens are inserted as
  rows with past `expires_at`, and lockout expiry is simulated by moving `locked_until`
  into the past in the test database.

## Docker

Docker Compose is not implemented. Use a locally running PostgreSQL instance for now.

## Future Improvements

- Basic CI (lint + test) on pull requests — `npm test` is ready to be wired in as-is
