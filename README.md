# Clinic Booking API

## Overview

A backend application for managing clinic appointment scheduling. Patients browse doctors, check availability, and book or cancel appointments. Doctors manage their availability and the status of their appointments. Admins manage accounts and specialties. Built with Node.js, Express.js, and PostgreSQL via Prisma.

> Status: documentation phase — implementation has not started yet.

## Features

- Registration and JWT-based login, with hashed passwords
- Role-based authorization (Patient / Doctor / Admin)
- Doctor profiles and specialties
- Doctor-managed availability slots
- Appointment booking with double-booking prevented at the database level
- Appointment status lifecycle (pending → confirmed → completed, or cancelled)
- Admin management of users, doctors, and specialties
- Centralized request validation and error handling
- Swagger/OpenAPI documentation

## Tech Stack

```text
Node.js
Express.js
JavaScript
PostgreSQL
Prisma
JWT
bcrypt / bcryptjs
Zod or Joi
Swagger (swagger-jsdoc / swagger-ui-express)
Docker (local PostgreSQL)
```

## Architecture

A layered Express application: routes → controllers → services → repositories → Prisma → PostgreSQL, with centralized authentication, authorization, validation, and error-handling middleware. Full details, including the request lifecycle and the responsibility of each layer, are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Database

PostgreSQL, accessed through Prisma. Six tables (`users`, `specialties`, `doctors`, `patients`, `availabilities`, `appointments`) with the appointment/availability relationship enforcing "no double booking" at the schema level. Full schema, constraints, and ERD are in [`docs/DATABASE.md`](docs/DATABASE.md).

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

> Commands below will be finalized once the project is scaffolded; this reflects the intended setup.

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the values (see Environment Variables)
3. Install dependencies
4. Start PostgreSQL (via Docker or a local install)
5. Run Prisma migrations
6. Start the development server

## Environment Variables

```text
DATABASE_URL=postgresql://user:password@localhost:5432/clinic_booking
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
PORT=3000
```

## Running the Application

```bash
# install dependencies
npm install

# run in development mode
npm run dev

# start in production mode
npm start
```

## Database Setup

Schema changes are managed with Prisma migrations:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

`npx prisma studio` can be used locally to inspect data during development.

## Testing

Unit tests will cover service-layer business rules (e.g. double-booking prevention, ownership checks, status transition rules). Integration/e2e tests will cover the main auth and booking flows end-to-end. No tests exist yet — this section will be updated as they're written.

## Docker

Docker Compose will run a local PostgreSQL instance so the database doesn't need to be installed system-wide. Not yet implemented.

## Future Improvements

- Refresh tokens
- Rate limiting on auth endpoints
- Basic CI (lint + test) on pull requests
