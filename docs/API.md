# Clinic Booking API — API Specification

Base path for all routes: `/api/v1`

## Authentication

Authentication uses a short-lived **access token** (JWT) plus a long-lived **refresh token** used only for acquiring new tokens.

```text
Authorization: Bearer <access-token>
```

The access token is a JWT containing the user's id (`sub`) and `role`; it expires after **15 minutes**. The authentication middleware verifies the token and attaches `{ id, role }` to `req.user`. Public endpoints (registration, login, browsing doctors/availability, viewing specialties) require no token.

An inactive account cannot log in or use a previously issued token. Authentication verifies that the account remains active on every protected request.

### Tokens

| Token | Format | Lifetime | Purpose |
|---|---|---|---|
| Access token | JWT (`{ sub, role }`) | 15 minutes | Authorizes protected requests |
| Refresh token | Opaque random 96-char string, stored SHA-256-hashed | 30 days | Obtaining new tokens; single-use with rotation |

Refresh tokens are single-use. Every `/auth/refresh` call revokes the presented token and issues a new access + refresh pair. If an already-rotated (revoked) refresh token is presented again, it is treated as possible token theft and the **entire token family** is revoked. Logout revokes the presented token's family. Refresh tokens are stored only as SHA-256 hashes in the `"RefreshToken"` table.

### Login lockout

After **5 consecutive failed login attempts**, the account is locked for **15 minutes**. While locked, even the correct password is rejected. The lockout state lives on the `"User"` row (`failed_login_count`, `locked_until`) and resets on successful login. All login failures — unknown email, wrong password, deactivated account, locked account — return the identical `401 Invalid email or password` response so the API does not reveal which accounts exist.

## Authorization Matrix

| Endpoint | Public | Patient | Doctor | Admin |
|---|---|---|---|---|
| Register | ✓ | | | |
| Login | ✓ | | | |
| Refresh token | ✓ | | | |
| Logout | | ✓ | ✓ | ✓ |
| View doctors / doctor detail | ✓ | ✓ | ✓ | ✓ |
| View doctor availability | ✓ | ✓ | ✓ | ✓ |
| View specialties (list & detail) | ✓ | ✓ | ✓ | ✓ |
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

### Rate limiting

Authentication endpoints are rate-limited per client IP: `POST /auth/login` (10 requests per 15 minutes), `POST /auth/register` (5 requests per hour), `POST /auth/refresh` (20 requests per 15 minutes). When a limit is exceeded the API responds `429 Too Many Requests`:

```json
{
  "message": "Too many requests. Please try again later."
}
```

## Pagination and Filtering

List endpoints accept `page` and `limit` query params, plus endpoint-specific filters:

```text
GET /doctors?page=1&limit=10&specialty=cardiology
GET /appointments/me?page=1&limit=10&status=CONFIRMED
```

Defaults: `page=1`, `limit=10`, `limit` capped at 100. Paginated responses are wrapped:

```json
{
  "status": "success",
  "data": [ ... ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Non-paginated responses use `{ "status": "success", "data": ... }` without `meta`.

---

## Auth Module

### POST /auth/register

Authentication: Public

Validation (Zod): `email` (valid email), `password` (min 8 chars, max 72 chars — the bcrypt limit), `fullName` (non-empty string), `phone` (optional string, max 30 chars), `role` (enum: `PATIENT` | `DOCTOR`), `specialtyId` (required UUID if role is `DOCTOR`).

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
  "data": { "id": "uuid", "role": "PATIENT" }
}
```

Errors: `409` email already registered, `400` validation failure, `404` the `specialtyId` does not exist.

Registration creates the account and its matching profile row (`Doctor` or `Patient`) in a single transaction. It never auto-authenticates — no tokens are returned; the client must call `/auth/login` afterwards. The response never includes the password hash or any token material.

`ADMIN` is not an accepted public-registration role. The first admin and any later admin accounts are created only through the local bootstrap script (`npm run create-admin`), not through this API.

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
    "refreshToken": "opaque-random-string",
    "user": { "id": "uuid", "role": "PATIENT" }
  }
}
```

Errors: `401` invalid credentials.

Every login failure (unknown email, wrong password, deactivated account, locked account) returns the same `401 Invalid email or password`. After 5 failed attempts the account is locked for 15 minutes.

### POST /auth/refresh

Authentication: Public

Purpose: Rotate a refresh token and receive a new access + refresh pair. The presented refresh token is revoked; a new one is issued in its place. Presenting an already-rotated (revoked) refresh token revokes the entire token family.

Validation: `refreshToken` (non-empty string).

Request:
```json
{ "refreshToken": "opaque-random-string" }
```

Response `200`: same shape as login (`accessToken`, `refreshToken`, `user`).

Errors: `401` the token is unknown, expired, revoked, or belongs to a deactivated account.

### POST /auth/logout

Authentication: Required (any role)

Purpose: Revoke the presented refresh token and its whole family, ending the session chain.

Validation: `refreshToken` (non-empty string).

Request:
```json
{ "refreshToken": "opaque-random-string" }
```

Response `204` No Content.

Errors: `401` missing/invalid access token, or the refresh token does not belong to the authenticated user.

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

A small, admin-managed lookup table. Listing and detail views are public; creating, updating, and deleting require ADMIN.

Duplicate names are guarded at two levels: the service checks first (friendly 409), and the database unique constraint is the race backstop (`P2002` → 409). Deleting a specialty that is concurrently assigned to a doctor surfaces through the foreign key as `P2003` → 409. `P2025` → 404.

### GET /specialties

Authentication: Public

Query params: `page` (optional, default 1, minimum 1), `limit` (optional, default 10, max 100), `search` (optional)

Search filters by specialty name using case-insensitive contains semantics; the same filter applies to the returned rows and to `meta.total`. Results are ordered by name ascending for deterministic pagination.

Response `200`:

```json
{
  "status": "success",
  "data": [
    { "id": "uuid", "name": "Cardiology", "created_at": "timestamp" }
  ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Errors: `400` invalid query parameters.

### GET /specialties/:id

Authentication: Public

Path param: `id` (UUID).

Response `200`: a single specialty object (`{ id, name, created_at }`).

Errors: `400` malformed UUID, `404` specialty not found.

### POST /specialties

Authentication: Required — Role: ADMIN

Validation: `name` (required string, trimmed, 2–100 characters; letters, spaces, hyphens, and ampersands only).

Request:
```json
{ "name": "Cardiology" }
```

Response `201`: the created specialty object.

Errors: `400` validation failure, `401` unauthenticated, `403` non-admin, `409` name already exists (`"Specialty with this name already exists"`). Two concurrent creates with the same name produce one success and one 409 via the unique-constraint backstop.

### PATCH /specialties/:id

Authentication: Required — Role: ADMIN

Validation: `name` (**required** string, trimmed, 2–100 characters).

Updating a specialty to its own current name succeeds with `200`. A name that belongs to a different specialty returns `409`.

Request:
```json
{ "name": "Neurology" }
```

Response `200`: the updated specialty object.

Errors: `400` validation failure, `401` unauthenticated, `403` non-admin, `404` specialty not found, `409` name belongs to another specialty.

### DELETE /specialties/:id

Authentication: Required — Role: ADMIN

Response `204` No Content (empty body).

Errors: `401` unauthenticated, `403` non-admin, `404` specialty not found, `409` a doctor is still assigned to this specialty (service-level doctor count; the FK `ON DELETE RESTRICT` constraint is the race backstop).

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

Scheduling uses the clinic timezone `Africa/Cairo`. Slots are individual local date/time intervals; adjacent slots are allowed. For the same doctor and date, an attempted slot overlaps when `newStart < existingEnd` and `newEnd > existingStart`; the service rejects it with `409`.

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

An availability slot can have one non-cancelled appointment. Cancelling an appointment retains it as history, changes its status to `CANCELLED`, and releases the slot so that it may be booked again.

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

This endpoint manages existing patient and doctor accounts only. There is no admin-account creation API; inactive users cannot log in or make protected requests.

### GET /admin/appointments

Authentication: Required — Role: ADMIN

Purpose: Read-only oversight of all appointments.

Query params: `page`, `limit`, `status`, `doctorId`, `patientId` (all optional)

---

## Swagger

The implemented Express API will expose Swagger/OpenAPI documentation at `/api/docs`, generated from JSDoc annotations (or an equivalent `swagger-jsdoc` setup) on the route definitions above. This document describes the intended contract ahead of that implementation.
