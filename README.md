# Clinic Booking API

## Overview

A backend application for managing clinic appointment scheduling. Patients browse doctors, check availability, and book or cancel appointments. Doctors manage their availability and the status of their appointments. Admins manage accounts and specialties. Built with Node.js, Express.js, and PostgreSQL via Prisma.

> Status: Foundation complete with centralized validation and error handling; authentication implemented (registration, JWT login, rotating refresh tokens, logout, login lockout, admin bootstrap script). Domain features (doctors, availability, appointments, admin management) are planned but not implemented yet.

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

PostgreSQL, accessed through Prisma. The initial schema and migration use Prisma's quoted PascalCase table names (`"User"`, `"Specialty"`, `"Doctor"`, `"Patient"`, `"Availability"`, and `"Appointment"`). The final appointment design will retain cancelled history and enforce one non-cancelled appointment per slot at the database level. Full schema decisions are in [`docs/DATABASE.md`](docs/DATABASE.md).

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

`npm run test:db` is a database connectivity smoke check, not an automated test suite. Automated service and integration tests will be added once business features exist.

## Docker

Docker Compose is not implemented. Use a locally running PostgreSQL instance for now.

## Future Improvements

- Rate limiting on auth endpoints
- Basic CI (lint + test) on pull requests
