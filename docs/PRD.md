# Clinic Booking API — Product Requirements Document

## Product Overview

The Clinic Booking API is a backend application that manages clinic appointment scheduling. Patients can look up doctors, check their availability, and book or cancel appointments. Doctors control their own schedule and the status of appointments booked against them. Admins manage the underlying accounts.

It replaces manual, ad-hoc scheduling (phone calls, paper calendars) with a structured system where availability and bookings are tracked consistently and appointment conflicts are prevented at the data level, not just by convention.

## Goals

- Provide a working, correctly-behaving appointment booking backend: registration, login, doctor/availability browsing, booking, cancellation, and status management.
- Enforce the core scheduling guarantee — a slot can never be double-booked — through the database schema, not only application checks.
- Apply authentication, authorization, and validation consistently across every endpoint.
- Keep the codebase in a clean, layered structure (routes → controllers → services → repositories) with clear separation of concerns.
- Handle errors predictably through a centralized error-handling strategy with consistent HTTP status codes and response shapes.
- Support the practical operational needs of a small clinic: doctor management, specialty management, and administrative oversight.

## User Roles

| Role | Responsibilities & Permissions |
|---|---|
| **Patient** | Registers and logs in; browses doctors and their availability; books an available slot; views their own appointments; cancels their own appointments. |
| **Doctor** | Logs in; manages their own profile; defines and removes their own availability slots; views appointments booked against them; updates the status of their own appointments (confirm, complete, cancel). |
| **Admin** | Logs in; manages user and doctor accounts (create, update, deactivate); manages the specialty list; has read access to appointments for administrative oversight. Admin accounts are not created through public registration. |

## Core Features

### Authentication
- Registration (patient and doctor accounts)
- Login with JWT issuance
- Password hashing (bcrypt/bcryptjs)
- JWT-based authentication on protected routes

### Doctors
- Doctor profiles (name, bio, specialty)
- Doctor specialties (a managed list; each doctor has one specialty)
- Doctor listing (with filtering/pagination)
- Doctor detail view

### Availability
- Doctors define individual availability slots (date, start time, end time)
- Doctors can remove their own unbooked slots
- Patients can view a doctor's open (unbooked) slots

### Appointments
- Booking an appointment against an available slot
- Viewing appointments (patient sees their own; doctor sees their own)
- Cancelling an appointment
- Appointment status management (pending → confirmed → completed, or cancelled)
- Preventing double booking, enforced at the schema level

### Administration
- Admin management of user and doctor accounts (view, update, deactivate)
- Admin management of the specialty list
- Admin read access to all appointments

## User Flows

**Patient**
```text
Register
→ Login
→ Browse Doctors
→ View Doctor
→ View Availability
→ Book Appointment
→ View Appointment
→ Cancel Appointment
```

**Doctor**
```text
Login
→ Manage Availability
→ View Appointments
→ Manage Appointment Status
```

**Admin**
```text
Login
→ Manage Users/Doctors
→ Manage Specialties
```

## Functional Requirements

1. Users register with an email, password, name, and role (patient or doctor); admin accounts are created directly by an existing admin.
2. Passwords are hashed before storage; plain-text passwords are never persisted or logged.
3. Login verifies credentials and returns a signed JWT containing the user's id and role.
4. Every protected route requires a valid JWT, verified by authentication middleware.
5. Every role-restricted route requires the correct role, verified by authorization middleware, in addition to authentication.
6. Doctors can create availability slots with a date, start time, and end time.
7. Doctors can delete their own availability slots as long as the slot is not already booked.
8. Any client can view a doctor's list of open availability slots.
9. A patient can book an available slot; this creates an appointment and marks the slot as booked in the same transaction.
10. A patient can view and cancel only their own appointments.
11. A doctor can view and manage only appointments tied to their own availability slots.
12. Cancelling a pending or confirmed appointment releases the underlying slot back to available; completed appointments cannot be cancelled.
13. Admins can list, update, and deactivate user and doctor accounts.
14. Admins can create, update, and delete specialties.
15. All request bodies and query parameters are validated at the boundary before reaching business logic.
16. All errors are handled centrally and return a consistent response shape with an appropriate HTTP status code.
17. List endpoints (doctors, appointments) support pagination and relevant filtering.

## Non-Functional Requirements

- **Security:** Password hashing, JWT-based auth, role and ownership checks on every resource access, sane CORS configuration.
- **Validation:** All input validated with a schema library (Zod or Joi) before it reaches services.
- **Maintainability:** Clear separation between routing, controllers, services, and data access; no business logic in routes or controllers.
- **Database Integrity:** Constraints (foreign keys, uniqueness, NOT NULL) enforced at the schema level as the primary safeguard, with application logic as a second layer.
- **Error Handling:** A single centralized error-handling middleware; predictable error response format.
- **API Consistency:** Uniform response shapes and status codes across all endpoints.
- **Performance Basics:** Pagination on list endpoints; indexes on columns used in common lookups (no premature optimization beyond that).

## Business Rules

- A patient cannot book a slot that is not currently `AVAILABLE`.
- A doctor cannot have two appointments at the same time — guaranteed because each appointment consumes exactly one availability slot, and a slot can back at most one active appointment.
- A patient cannot book the same slot twice (enforced by the one-to-one relationship between a slot and its appointment).
- A patient can only cancel their own appointments.
- A doctor can only manage their own availability and only act on appointments tied to their own slots.
- Users cannot access resources belonging to other users; this is enforced by ownership checks in the service layer, not just role checks.
- Every appointment must reference a valid, existing doctor and patient.
- Appointment status transitions are controlled: `PENDING → CONFIRMED → COMPLETED`, with `CANCELLED` reachable from `PENDING` or `CONFIRMED` only. A `COMPLETED` or already-`CANCELLED` appointment cannot transition further.
- Cancelling an appointment (from `PENDING` or `CONFIRMED`) sets its status to `CANCELLED` and returns the underlying slot to `AVAILABLE`.
- Past appointments (slot date/time already elapsed) cannot be modified or cancelled, except that a doctor may still mark a past `CONFIRMED` appointment as `COMPLETED`.

## Out of Scope

- Payment processing or billing
- Email/SMS notifications or reminders
- Medical records, prescriptions, or EMR functionality
- Insurance handling
- Multiple clinics or multi-tenant support
- Doctors having more than one specialty
- Recurring/repeating availability patterns (slots are created individually)
- Real-time updates (websockets, live calendar sync)
- Advanced scheduling or optimization algorithms
