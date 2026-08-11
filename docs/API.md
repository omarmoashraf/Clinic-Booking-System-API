# Clinic Booking API — API Specification

Base path for all routes: `/api/v1`

## Authentication

JWT is sent as a bearer token on every protected request:

```text
Authorization: Bearer <token>
```

The authentication middleware verifies the token and attaches `{ id, role }` to `req.user`. Public endpoints (registration, login, browsing doctors/availability, viewing specialties) require no token.

## Authorization Matrix

| Endpoint | Public | Patient | Doctor | Admin |
|---|---|---|---|---|
| Register | ✓ | | | |
| Login | ✓ | | | |
| View doctors / doctor detail | ✓ | ✓ | ✓ | ✓ |
| View doctor availability | ✓ | ✓ | ✓ | ✓ |
| View specialties | ✓ | ✓ | ✓ | ✓ |
| Update own doctor profile | | | ✓ | |
| Update own patient profile | | ✓ | | |
| Create/delete own availability | | | ✓ | |
| Book appointment | | ✓ | | |
| View own appointments | | ✓ | ✓ | |
| Cancel own appointment | | ✓ | ✓ | |
| Update appointment status (confirm/complete) | | | ✓ | |
| Manage specialties (create/update/delete) | | | | ✓ |
| Manage users/doctors (admin) | | | | ✓ |
| View all appointments | | | | ✓ |

## Error Response

Consistent shape across the API:

```json
{
  "status": "error",
  "message": "Appointment slot is already booked"
}
```

Validation errors include a `details` array:

```json
{
  "status": "error",
  "message": "Validation failed",
  "details": [
    { "field": "email", "message": "must be a valid email" },
    { "field": "password", "message": "must be at least 8 characters" }
  ]
}
```

## Pagination and Filtering

List endpoints accept `page` and `limit` query params, plus endpoint-specific filters:

```text
GET /doctors?page=1&limit=10&specialty=cardiology
GET /appointments/me?page=1&limit=10&status=CONFIRMED
```

Defaults: `page=1`, `limit=10`, `limit` capped at 50. Paginated responses are wrapped:

```json
{
  "status": "success",
  "data": [ ... ],
  "meta": { "page": 1, "limit": 10, "total": 42 }
}
```

Non-paginated responses use `{ "status": "success", "data": ... }` without `meta`.

---

## Auth Module

### POST /auth/register

Authentication: Public

Validation (Zod, conceptually): `email` (valid email), `password` (min 8 chars), `fullName` (non-empty string), `phone` (optional string), `role` (enum: `PATIENT` | `DOCTOR`), `specialtyId` (required UUID if role is `DOCTOR`).

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
  "status": "success",
  "data": { "id": "uuid", "email": "patient@example.com", "role": "PATIENT" }
}
```

Errors: `409` email already registered, `400` validation failure.

### POST /auth/login

Authentication: Public

Validation: `email` (valid email), `password` (non-empty string).

Request:
```json
{ "email": "patient@example.com", "password": "SecurePass123" }
```

Response `200`:
```json
{
  "status": "success",
  "data": {
    "accessToken": "jwt-token",
    "user": { "id": "uuid", "role": "PATIENT" }
  }
}
```

Errors: `401` invalid credentials.

---

## Users Module

### GET /users/me

Authentication: Required (any role)

Purpose: Return the authenticated user merged with their doctor or patient profile.

Response `200`: user + role-specific profile fields.

---

## Doctors Module

### GET /doctors

Authentication: Public

Query params: `page`, `limit`, `specialty` (specialty name or id, optional)

Response `200`: paginated list of `{ id, fullName, specialty, bio }`.

### GET /doctors/:id

Authentication: Public

Errors: `404` not found.

### PATCH /doctors/me

Authentication: Required — Role: DOCTOR

Validation: `bio` (optional string), `specialtyId` (optional UUID)

Errors: `400` validation failure.

---

## Patients Module

### PATCH /patients/me

Authentication: Required — Role: PATIENT

Validation: `fullName` (optional string), `phone` (optional string), `dateOfBirth` (optional date)

Errors: `400` validation failure.

---

## Specialties Module

### GET /specialties

Authentication: Public

Response `200`: array of `{ id, name }`.

### POST /specialties

Authentication: Required — Role: ADMIN

Validation: `name` (non-empty string)

Errors: `409` name already exists.

### PATCH /specialties/:id

Authentication: Required — Role: ADMIN

Validation: `name` (optional string)

### DELETE /specialties/:id

Authentication: Required — Role: ADMIN

Errors: `409` a doctor is still assigned to this specialty.

---

## Availability Module

### GET /doctors/:doctorId/availability

Authentication: Public

Purpose: List a doctor's `AVAILABLE` slots.

Query params: `from` (date, optional), `to` (date, optional)

Response `200`: array of `{ id, date, startTime, endTime }`.

### POST /doctors/me/availability

Authentication: Required — Role: DOCTOR

Validation: `date` (date string), `startTime` (HH:mm), `endTime` (HH:mm, must be after `startTime`)

Errors: `400` invalid time range, `409` overlaps an existing slot.

### DELETE /doctors/me/availability/:id

Authentication: Required — Role: DOCTOR

Errors: `403` slot doesn't belong to the requester, `409` slot is already booked.

---

## Appointments Module

### POST /appointments

Authentication: Required — Role: PATIENT

Validation: `availabilityId` (UUID), `notes` (optional string)

Request:
```json
{ "availabilityId": "uuid", "notes": "First visit" }
```

Response `201`: created appointment, status `PENDING`.

Errors: `404` slot not found, `409` slot no longer `AVAILABLE`.

### GET /appointments/me

Authentication: Required — Role: PATIENT or DOCTOR

Purpose: List the caller's own appointments (as patient or as doctor, depending on role).

Query params: `page`, `limit`, `status` (optional)

### GET /appointments/:id

Authentication: Required — Role: PATIENT, DOCTOR, or ADMIN

Errors: `403` doesn't belong to requester (unless ADMIN), `404` not found.

### PATCH /appointments/:id/status

Authentication: Required — Role: DOCTOR (own appointments, any valid transition) or PATIENT (own appointments, cancel only)

Validation: `status` (enum: `CONFIRMED` | `CANCELLED` | `COMPLETED`)

Errors: `403` ownership/role mismatch, `409` invalid state transition (e.g. cancelling a `COMPLETED` appointment, or modifying a past appointment other than marking it `COMPLETED`).

---

## Admin Module

### GET /admin/users

Authentication: Required — Role: ADMIN

Query params: `page`, `limit`, `role` (optional), `isActive` (optional)

### PATCH /admin/users/:id

Authentication: Required — Role: ADMIN

Validation: `fullName` (optional string), `phone` (optional string), `isActive` (optional boolean)

### GET /admin/appointments

Authentication: Required — Role: ADMIN

Purpose: Read-only oversight of all appointments.

Query params: `page`, `limit`, `status`, `doctorId`, `patientId` (all optional)

---

## Swagger

The implemented Express API will expose Swagger/OpenAPI documentation at `/api/docs`, generated from JSDoc annotations (or an equivalent `swagger-jsdoc` setup) on the route definitions above. This document describes the intended contract ahead of that implementation.
