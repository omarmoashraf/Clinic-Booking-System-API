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
| **Admin** | Logs in; lists, updates, and deactivates user and doctor accounts; manages the specialty list; has read access to appointments for administrative oversight. Admin accounts are never created through public registration. |

## Core Features

### Authentication
- Registration (patient and doctor accounts)
- Login with JWT issuance
- Password hashing (bcrypt)
- JWT-based authentication on protected routes
- Refresh-token rotation with reuse detection and revocation
- Logout (server-side token revocation)
- Login lockout after repeated failed attempts

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

1. Users register with an email, password, name, and role (patient or doctor). Admin accounts are never created through public registration or an API endpoint.
2. Passwords are hashed before storage; plain-text passwords are never persisted or logged.
3. Login verifies credentials and returns a signed access token containing the user's id and role, plus a rotating refresh token.
4. Every protected route requires a valid access token, verified by authentication middleware.
5. Every role-restricted route requires the correct role, verified by authorization middleware, in addition to authentication.
6. Refresh tokens are single-use; each refresh rotates the token and reusing a rotated token revokes the session family. Logout revokes the session server-side.
7. After 5 consecutive failed login attempts an account is locked for 15 minutes; all login failures return the same generic 401.
8. Doctors can create availability slots with a date, start time, and end time.
9. Doctors can delete their own availability slots as long as the slot is not already booked.
10. Any client can view a doctor's list of open availability slots.
11. A patient can book an available slot; this creates an appointment and marks the slot as booked in the same transaction.
12. A patient can view and cancel only their own appointments.
13. A doctor can view and manage only appointments tied to their own availability slots.
14. Cancelling a pending or confirmed appointment releases the underlying slot back to available; completed appointments cannot be cancelled.
15. Admins can list, update, and deactivate user and doctor accounts.
16. Admins can create, update, and delete specialties.
17. All request bodies and query parameters are validated at the boundary before reaching business logic.
18. All errors are handled centrally and return a consistent response shape with an appropriate HTTP status code.
19. List endpoints (doctors, appointments) support pagination and relevant filtering.

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
- A doctor cannot have overlapping availability slots. A slot may end exactly when the next begins; otherwise two slots on the same date overlap when `newStart < existingEnd` and `newEnd > existingStart`.
- A slot can have only one non-cancelled appointment at a time. Cancelled appointments remain as history and a later appointment may reuse the released slot.
- A patient can only cancel their own appointments.
- A doctor can only manage their own availability and only act on appointments tied to their own slots.
- Users cannot access resources belonging to other users; this is enforced by ownership checks in the service layer, not just role checks.
- Every appointment must reference a valid, existing doctor and patient.
- Appointment status transitions are controlled: `PENDING → CONFIRMED → COMPLETED`, with `CANCELLED` reachable from `PENDING` or `CONFIRMED` only. A `COMPLETED` or already-`CANCELLED` appointment cannot transition further.
- Cancelling an appointment (from `PENDING` or `CONFIRMED`) sets its status to `CANCELLED` and returns the underlying slot to `AVAILABLE`.
- Past appointments (slot date/time already elapsed) cannot be modified or cancelled, except that a doctor may still mark a past `CONFIRMED` appointment as `COMPLETED`.

## Operational Decisions

### First admin bootstrap and account scope

The first admin is created only through a local, development-only bootstrap command (`npm run create-admin`), which reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_FULL_NAME` from the local environment and refuses to run in production. It creates a single `ADMIN` user and is never exposed as an HTTP endpoint or committed with credentials.

Normal administration is deliberately small: admins can list, update, and deactivate patient and doctor accounts, and manage specialties. Creating additional `ADMIN` accounts is also a local maintenance/bootstrap operation, not an API feature. This keeps the learning project focused on role checks and account lifecycle rather than an admin-provisioning system.

### Deactivation

An inactive user cannot log in. If an account is deactivated after a token was issued, authentication rejects subsequent protected requests after checking that the account is still active. Refresh requests for a deactivated account are also rejected, so no new tokens are issued; the refresh-token repository exposes a revoke-all-for-user operation that the admin module's deactivation path is expected to call when admin account management is implemented. Inactive patients cannot book or cancel appointments; inactive doctors cannot manage profiles, availability, or appointment status; inactive admins cannot perform admin operations. Existing records remain for history.

### Scheduling time and availability overlap

All clinic dates and times are interpreted in the single clinic timezone `Africa/Cairo`. The project stores a slot as a local date plus local start/end times; multi-timezone conversion is out of scope.

Doctors create individual slots. Adjacent slots are valid, but overlapping slots for the same doctor and date are rejected with `409 Conflict`. The first implementation uses a service-level overlap query; PostgreSQL range/exclusion constraints are intentionally out of scope for this learning project.

### Availability time invariant

`end_time` must be strictly later than `start_time`. This is enforced three ways when availability is implemented: request validation, service-level validation, and a PostgreSQL `CHECK` constraint added in the availability migration. It is not part of the current foundation migration.

### Appointment cancellation and rebooking

Cancelled appointments are retained as history and release their slot. The final appointment design therefore permits an availability row to have many historical appointments, but only one non-cancelled appointment. In the appointment milestone, the current `availability_id` unique constraint will be replaced by a PostgreSQL partial unique index for non-`CANCELLED` appointments, while the booking/cancellation transaction updates the slot status atomically. This preserves history, permits rebooking after cancellation, and keeps the active-booking guarantee in the database.

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
