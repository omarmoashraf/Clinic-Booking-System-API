# Clinic Booking API — Product Requirements Document

## Product Overview

The Clinic Booking API is a backend REST service that lets patients find doctors, view their available appointment slots, and book, view, or cancel appointments online. Doctors manage their own availability and the appointments booked against it. Admins manage the underlying user base (patients, doctors, specialties).

It solves the everyday problem of appointment scheduling in a small clinic setting: instead of phone calls and manual calendars, patients self-serve through an API-driven booking flow, and doctors get a single source of truth for their schedule.

This is a **portfolio backend project**. The goal is a clean, realistic, production-style API — not a full hospital management system.

## Goals

This project is intended to demonstrate:

- Practical REST API design with NestJS
- Relational database modeling in PostgreSQL
- JWT-based authentication and role-based authorization
- DTO validation with `class-validator`
- Correct use of guards and route protection
- Sound handling of business logic and edge cases (e.g., double booking)
- Consistent error handling
- API documentation via Swagger/OpenAPI
- Clean, modular, maintainable NestJS project structure

## User Roles

| Role | Description |
|------|-------------|
| **Patient** | Registers an account, browses doctors, views available slots, books/cancels their own appointments, views their appointment history. |
| **Doctor** | Manages their own availability slots, views appointments booked against them, updates the status of their appointments (confirm, complete). |
| **Admin** | Manages doctors, patients, and specialties at an account level (e.g., create/deactivate a doctor account, manage the list of specialties). Has read access to appointments for oversight. |

## Core Features

- User registration (patient and doctor accounts)
- Login with JWT issuance
- Role-based authorization (Patient / Doctor / Admin)
- Doctor profiles (name, bio, specialty)
- Patient profiles (name, contact info)
- Doctor specialties (a fixed, admin-managed list; each doctor has one specialty)
- Doctor availability management (create/view/delete open slots)
- Viewing available appointment slots (by doctor, and optionally by specialty)
- Booking an appointment against an available slot
- Viewing appointments (patient sees their own, doctor sees their own)
- Cancelling an appointment (by the patient who booked it, or the doctor it belongs to)
- Doctor managing appointment status (confirm / complete)
- Admin managing doctors, patients, and specialties

## Core User Flows

**Patient**
Register → Login → Browse Doctors (optionally filter by specialty) → View Doctor's Available Slots → Book Appointment → View My Appointments → Cancel Appointment (if needed)

**Doctor**
Register/Login → Create Availability Slots → View Appointments Booked Against Me → Confirm/Complete/Cancel an Appointment

**Admin**
Login → Manage Specialties → Manage Doctor Accounts → Manage Patient Accounts → View Appointments (read-only oversight)

## Functional Requirements

1. Users can register as a patient or a doctor; admin accounts are seeded/created by an existing admin, not via public registration.
2. Users authenticate via email/password and receive a JWT on successful login.
3. Every protected route must be guarded by JWT authentication.
4. Every role-restricted route must be guarded by role-based authorization.
5. Doctors can create availability slots (date, start time, end time).
6. Doctors can view and delete their own availability slots that are not yet booked.
7. Patients can view a doctor's available (unbooked) slots.
8. Patients can book an available slot, which creates an appointment and marks the slot as booked.
9. A patient can only view and cancel their own appointments.
10. A doctor can only view and manage appointments tied to their own availability slots.
11. Cancelling an appointment frees the underlying slot only according to the rule defined in Business Rules.
12. Admins can create, update, and deactivate doctor and patient accounts.
13. Admins can create, update, and delete specialties.
14. All input is validated via DTOs before reaching business logic.
15. All error responses follow a consistent format.

## Non-Functional Requirements

- **Validation:** All request bodies validated with `class-validator` DTOs; invalid input rejected with clear 400 responses.
- **Authentication:** Stateless JWT authentication for all protected endpoints.
- **Authorization:** Role-based guards enforced at the route level.
- **Error Handling:** Centralized, consistent error response shape across the API.
- **Security Basics:** Password hashing (bcrypt), no sensitive data in JWT payload beyond user id/role, ownership checks on all resource access.
- **Database Integrity:** Foreign keys, unique constraints, and NOT NULL constraints enforced at the schema level, not only in application code.
- **API Documentation:** Full Swagger/OpenAPI documentation generated from the NestJS application.
- **Maintainable Code Structure:** Feature-based NestJS modules (auth, users, doctors, patients, availability, appointments) with clear separation of controllers, services, and DTOs.

## Business Rules

- A patient cannot book the same time slot twice (a slot can only ever have one active appointment against it).
- A doctor cannot have two appointments at the same time — enforced because each appointment is tied to exactly one availability slot, and slots represent non-overlapping time blocks.
- Patients can only cancel their own appointments.
- Doctors can only manage their own availability and only act on appointments tied to their own slots.
- Users cannot access resources belonging to other users (enforced via ownership checks, not just role checks).
- Every appointment must belong to an existing doctor and an existing patient.
- Booking is only possible against a slot currently in an `AVAILABLE` state.
- Appointment statuses are: `PENDING` (just booked, awaiting doctor confirmation), `CONFIRMED` (doctor confirmed), `CANCELLED` (cancelled by patient or doctor), `COMPLETED` (visit took place).
- Cancelling an appointment sets its status to `CANCELLED` and returns the underlying availability slot to `AVAILABLE`, unless the appointment was already `COMPLETED` (completed appointments cannot be cancelled).

## Out of Scope

- Payment processing or billing of any kind
- Email/SMS notifications or reminders
- Medical records, prescriptions, or EMR functionality
- Insurance handling
- Multi-clinic or multi-tenant support
- Doctors having multiple specialties
- Recurring/repeating availability patterns (each slot is created individually)
- Real-time features (e.g., live calendar sync, websockets)
- Advanced scheduling algorithms (e.g., automatic slot generation, conflict resolution beyond simple uniqueness checks)
