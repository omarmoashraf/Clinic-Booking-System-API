# Clinic Booking API — API Specification

Base path for all routes: `/api/v1`

## Authentication

The API uses stateless JWT authentication. On successful login, the client receives an access token that must be sent as `Authorization: Bearer <token>` on every protected request. The token payload contains the user's `id` and `role`; no sensitive data is embedded in it.

## Authorization

Route access is controlled by a role guard on top of the auth guard. Summary by module:

| Module | Public | Patient | Doctor | Admin |
|---|---|---|---|---|
| Auth | register, login | — | — | — |
| Doctors (browse) | list/view doctors | — | — | — |
| Availability (view) | view a doctor's open slots | — | — | — |
| Availability (manage) | — | — | create/delete own slots | — |
| Appointments | — | book/view/cancel own | view/manage own | view all (read-only) |
| Users/Doctors/Patients (admin) | — | — | — | full CRUD |
| Specialties (manage) | — | — | — | full CRUD |
| Specialties (view) | list specialties | — | — | — |

Ownership is enforced in addition to role checks — e.g. a patient can only cancel an appointment where `appointment.patient_id` matches their own patient record.

## Error Handling

All errors follow a single consistent shape:

```json
{
  "statusCode": 404,
  "message": "Appointment not found",
  "error": "Not Found"
}
```

For validation errors, `message` is an array of field-level issues:

```json
{
  "statusCode": 400,
  "message": ["email must be a valid email", "password must be at least 8 characters"],
  "error": "Bad Request"
}
```

No custom error hierarchy beyond NestJS's built-in `HttpException` subclasses (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`) is introduced.

## DTOs

Only the DTOs actually needed by the endpoints below:

- `RegisterDto` — `email`, `password`, `fullName`, `phone?`, `role` ('PATIENT' | 'DOCTOR'), plus `specialtyId` (required if role is DOCTOR)
- `LoginDto` — `email`, `password`
- `UpdateDoctorProfileDto` — `bio?`, `specialtyId?`
- `UpdatePatientProfileDto` — `fullName?`, `phone?`, `dateOfBirth?`
- `CreateSpecialtyDto` — `name`
- `UpdateSpecialtyDto` — `name?`
- `CreateAvailabilityDto` — `date`, `startTime`, `endTime`
- `CreateAppointmentDto` — `availabilityId`, `notes?`
- `UpdateAppointmentStatusDto` — `status` ('CONFIRMED' | 'CANCELLED' | 'COMPLETED')
- `AdminUpdateUserDto` — `fullName?`, `phone?`, `isActive?`

---

## Auth Module

### POST /auth/register

Authentication: Public

Request:
```json
{
  "email": "patient@example.com",
  "password": "SecurePass123",
  "fullName": "Jane Doe",
  "phone": "+201000000000",
  "role": "PATIENT"
}
```

Response `201`:
```json
{
  "id": "uuid",
  "email": "patient@example.com",
  "role": "PATIENT"
}
```

Errors: `409` if email already registered, `400` on validation failure.

### POST /auth/login

Authentication: Public

Request:
```json
{
  "email": "patient@example.com",
  "password": "SecurePass123"
}
```

Response `200`:
```json
{
  "accessToken": "jwt-token",
  "user": {
    "id": "uuid",
    "role": "PATIENT"
  }
}
```

Errors: `401` on invalid credentials.

---

## Users Module

### GET /users/me

Authentication: Required (any role)

Purpose: Return the authenticated user's own account + role-specific profile.

Response `200`: user record merged with doctor or patient profile as applicable.

---

## Doctors Module

### GET /doctors

Authentication: Public

Purpose: List doctors, optionally filtered by specialty.

Query params: `specialtyId?`

Response `200`: array of doctor summaries (`id`, `fullName`, `specialty`, `bio`).

### GET /doctors/:id

Authentication: Public

Purpose: View a single doctor's public profile.

Errors: `404` if not found.

### PATCH /doctors/me

Authentication: Required — Role: DOCTOR

Purpose: Update the logged-in doctor's own profile.

Request: `UpdateDoctorProfileDto`

Errors: `400` on validation failure.

---

## Patients Module

### PATCH /patients/me

Authentication: Required — Role: PATIENT

Purpose: Update the logged-in patient's own profile.

Request: `UpdatePatientProfileDto`

Errors: `400` on validation failure.

---

## Specialties Module

### GET /specialties

Authentication: Public

Response `200`: array of `{ id, name }`.

### POST /specialties

Authentication: Required — Role: ADMIN

Request: `CreateSpecialtyDto`

Errors: `409` if name already exists.

### PATCH /specialties/:id

Authentication: Required — Role: ADMIN

Request: `UpdateSpecialtyDto`

### DELETE /specialties/:id

Authentication: Required — Role: ADMIN

Errors: `409` if a doctor is still assigned to this specialty.

---

## Availability Module

### GET /doctors/:doctorId/availability

Authentication: Public

Purpose: List a doctor's `AVAILABLE` (open) slots.

Query params: `from?`, `to?` (date range)

Response `200`: array of `{ id, date, startTime, endTime }`.

### POST /doctors/me/availability

Authentication: Required — Role: DOCTOR

Purpose: Create a new availability slot for the logged-in doctor.

Request: `CreateAvailabilityDto`

Errors: `400` if `endTime <= startTime`, `409` if it overlaps an existing slot.

### DELETE /doctors/me/availability/:id

Authentication: Required — Role: DOCTOR

Purpose: Remove one of the logged-in doctor's own slots.

Errors: `403` if the slot doesn't belong to the requester, `409` if the slot is already `BOOKED`.

---

## Appointments Module

### POST /appointments

Authentication: Required — Role: PATIENT

Purpose: Book an available slot.

Request:
```json
{
  "availabilityId": "uuid",
  "notes": "First visit"
}
```

Response `201`: the created appointment, status `PENDING`.

Errors: `404` if the slot doesn't exist, `409` if it's no longer `AVAILABLE`.

### GET /appointments/me

Authentication: Required — Role: PATIENT or DOCTOR

Purpose: List the caller's own appointments (as patient or as doctor, depending on role).

Query params: `status?`

### GET /appointments/:id

Authentication: Required — Role: PATIENT, DOCTOR, or ADMIN

Errors: `403` if the appointment doesn't belong to the requester (unless ADMIN), `404` if not found.

### PATCH /appointments/:id/status

Authentication: Required — Role: DOCTOR (own appointments) or PATIENT (own appointments, cancel only)

Purpose: Update appointment status. A patient may only transition their own appointment to `CANCELLED`. A doctor may transition their own appointments to `CONFIRMED`, `CANCELLED`, or `COMPLETED`.

Request: `UpdateAppointmentStatusDto`

Errors: `403` on ownership or invalid role/status combination, `409` on an invalid state transition (e.g. cancelling a `COMPLETED` appointment).

---

## Admin Module

### GET /admin/users

Authentication: Required — Role: ADMIN

Query params: `role?`, `isActive?`

### PATCH /admin/users/:id

Authentication: Required — Role: ADMIN

Request: `AdminUpdateUserDto`

Purpose: Update contact info or activate/deactivate an account.

### GET /admin/appointments

Authentication: Required — Role: ADMIN

Purpose: Read-only oversight view of all appointments, with filters.

Query params: `status?`, `doctorId?`, `patientId?`

---

## Swagger

The NestJS application will expose live Swagger/OpenAPI documentation at `/api/docs`, generated directly from controller decorators and DTOs, once the modules above are implemented. This file describes the intended contract ahead of that implementation.
