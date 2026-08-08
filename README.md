# Clinic Booking API

### Overview

A REST API for booking clinic appointments. Patients browse doctors, view their available slots, and book or cancel appointments. Doctors manage their availability and appointment statuses. Admins manage doctor/patient accounts and specialties. Built with NestJS, TypeScript, and PostgreSQL as a portfolio backend project.

> Status: documentation phase — implementation has not started yet.

### Features

- User registration and JWT login
- Role-based authorization (Patient / Doctor / Admin)
- Doctor profiles with specialties
- Doctor-managed availability slots
- Appointment booking with double-booking prevention
- Appointment status lifecycle (pending → confirmed → completed / cancelled)
- Admin management of users and specialties
- Swagger/OpenAPI documentation

### Tech Stack

- NestJS
- TypeScript
- PostgreSQL
- JWT (`@nestjs/jwt`, `passport-jwt`)
- Docker (for local Postgres, added later)
- Swagger (`@nestjs/swagger`)
- `class-validator` / `class-transformer`

### Architecture

The project follows NestJS's modular architecture: each domain area (auth, users, doctors, patients, specialties, availability, appointments) is its own module with a controller, service, and DTOs. Cross-cutting concerns — JWT auth and role checks — are implemented as guards applied at the route or controller level. See [`docs/DATABASE.md`](docs/DATABASE.md) for the data model behind these modules.

### Project Structure

```text
src/
├── auth/
│   ├── guards/
│   ├── strategies/
│   └── dto/
├── users/
├── doctors/
├── patients/
├── specialties/
├── availability/
├── appointments/
├── admin/
├── common/
│   ├── decorators/
│   └── filters/
├── app.module.ts
└── main.ts
```

### Database

PostgreSQL, accessed via an ORM (TypeORM/Prisma — to be finalized during implementation). Full schema, relationships, constraints, and the ERD are documented in [`docs/DATABASE.md`](docs/DATABASE.md).

### API Documentation

The full endpoint-by-endpoint specification, including request/response shapes and role requirements, is in [`docs/API.md`](docs/API.md). Once implemented, the same API will be browsable live via Swagger at `/api/docs`.

### Getting Started

> The exact commands below will be finalized once the project is scaffolded. This section reflects the intended setup.

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the values (see Environment Variables below)
3. Install dependencies
4. Start PostgreSQL (locally or via Docker, once added)
5. Run database migrations
6. Start the development server

### Environment Variables

```text
DATABASE_URL=postgresql://user:password@localhost:5432/clinic_booking
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
PORT=3000
```

### Running the Project

```bash
# install dependencies
npm install

# run in development mode
npm run start:dev

# build for production
npm run build
npm run start:prod
```

### Testing

Unit tests for services (business rules such as double-booking prevention and ownership checks) and e2e tests for the main auth/booking flows are planned using NestJS's built-in Jest setup. No coverage numbers are claimed yet — this section will be updated once tests are written.

### Docker

Docker Compose will be added to run a local PostgreSQL instance for development, so the app can be spun up without installing Postgres system-wide. This is not implemented yet.

### Future Improvements

- Pagination and sorting on list endpoints
- Rate limiting on auth endpoints
- Refresh tokens
- Automated CI pipeline (lint + test) on pull requests
