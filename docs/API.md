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

Purpose: Return the authenticated user merged with their role-specific profile. The profile is resolved from the token's user id — never from client input.

Response `200`:

```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "patient@example.com",
    "fullName": "Jane Doe",
    "phone": "+201000000000",
    "role": "PATIENT",
    "isActive": true,
    "createdAt": "timestamp",
    "updatedAt": "timestamp",
    "patient": { "id": "uuid", "dateOfBirth": "1995-06-15" }
  }
}
```

The account fields (`id`, `email`, `fullName`, `phone`, `role`, `isActive`, `createdAt`, `updatedAt`) are always present. The role-specific profile is keyed exactly like the database relation:

* `PATIENT` → `"patient": { id, dateOfBirth }`
* `DOCTOR` → `"doctor": { id, specialty: { id, name }, bio }`
* `ADMIN` has no role profile, so neither key is present.

A `PATIENT` never receives doctor data and vice versa. The response never includes the password hash, lockout state (`failed_login_count`, `locked_until`), or any token material.

`dateOfBirth` is a date-only value serialized as `YYYY-MM-DD`.

Errors: `401` missing/invalid access token or deactivated account, `404` the authenticated user's role profile row is missing (integrity error).

---

## Doctors Module

### GET /doctors

Authentication: Public

Query params: `page`, `limit`, `specialty` (specialty name or id, optional)

The `specialty` filter matches a specialty id, or a specialty name case-insensitively; an unknown specialty yields an empty page, not an error.

Response `200`: paginated list of `{ id, fullName, specialty, bio }`.

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "fullName": "Jane Doe",
      "specialty": { "id": "uuid", "name": "Cardiology" },
      "bio": "Short professional bio"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Errors: `400` invalid query parameters.

### GET /doctors/:id

Authentication: Public

Response `200`: `{ "status": "success", "data": { "id", "fullName", "specialty", "bio" } }`.

Errors: `400` malformed UUID, `404` doctor not found.

### PATCH /doctors/me

Authentication: Required — Role: DOCTOR

Validation: `bio` (optional string), `specialtyId` (optional UUID)

The doctor being updated is always resolved from the authenticated user (`req.user` → their own `Doctor` row); there is no client-supplied doctor id on this endpoint.

Response `200`: the updated doctor object (`{ id, fullName, specialty, bio }`). An empty body is a valid no-op returning the current profile.

Errors: `401` unauthenticated, `403` non-DOCTOR, `400` validation failure, `404` the `specialtyId` does not exist.

---

## Patients Module

### PATCH /patients/me

Authentication: Required — Role: PATIENT

Validation: `fullName` (optional string, trimmed, non-empty, max 150 chars), `phone` (optional string, trimmed, max 30 chars), `dateOfBirth` (optional date-only string, exactly `YYYY-MM-DD`, must be a real calendar date).

This is a partial update: only supplied fields change; omitted fields keep their current values. Unknown fields are ignored. An empty body is a valid no-op returning the current profile.

`fullName` and `phone` live on the account (`"User"`) row while `dateOfBirth` lives on the `"Patient"` profile row; both are written together atomically. The patient being updated is always resolved from the authenticated user (`req.user` → their own `Patient` row); there is no client-supplied patient id on this endpoint, so a patient cannot modify another patient's profile.

Request:
```json
{
  "fullName": "Jane Doe",
  "phone": "+201000000000",
  "dateOfBirth": "1995-06-15"
}
```

Response `200`: the updated merged profile in the same shape as `GET /users/me` for a PATIENT (account fields plus `"patient": { id, dateOfBirth }`). `dateOfBirth` is returned as `YYYY-MM-DD`.

Errors: `401` unauthenticated, `403` non-PATIENT (DOCTOR/ADMIN), `400` validation failure, `404` the authenticated PATIENT has no Patient profile row (integrity error).

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

All availability endpoints speak clinic-local wall-clock values: `date` is a date-only `YYYY-MM-DD` string, `startTime`/`endTime` are `HH:mm` 24-hour strings. The clinic timezone is `Africa/Cairo` (fixed by the PRD); slots are stored as a local date plus local start/end times and are never converted through instants, so no multi-timezone support exists and server/browser timezones never affect what is stored or returned.

### GET /doctors/:doctorId/availability

Authentication: Public

Purpose: List a doctor's `AVAILABLE` slots. `BOOKED` slots are filtered out in the database query and are never exposed through this endpoint.

Path param: `doctorId` (UUID).

Query params: `from` (date, optional), `to` (date, optional) — inclusive bounds on the slot date (`from <= date <= to`). Any combination is valid: neither, `from` only, `to` only, or both; when both are present, `to` must not be earlier than `from`.

Response `200`: array of `{ id, date, startTime, endTime }`, ordered by date then start time.

```json
{
  "status": "success",
  "data": [
    { "id": "uuid", "date": "2026-09-01", "startTime": "09:30", "endTime": "11:00" }
  ]
}
```

A doctor with no matching available slots returns `"data": []`, not an error.

Errors: `400` malformed `doctorId` UUID or invalid `from`/`to` dates, `404` the doctor does not exist.

### POST /doctors/me/availability

Authentication: Required — Role: DOCTOR

Validation: `date` (exactly `YYYY-MM-DD`, must be a real calendar date), `startTime` (`HH:mm` 24-hour), `endTime` (`HH:mm` 24-hour, must be strictly after `startTime`).

The owning doctor is always resolved from the authenticated user (`req.user` → their own `Doctor` row); there is no client-supplied doctor id on this endpoint. Unknown body fields are ignored.

Request:
```json
{ "date": "2026-09-01", "startTime": "09:30", "endTime": "11:00" }
```

Response `201`: the created slot (`{ id, date, startTime, endTime }`) in the same shape as the listing above.

Errors: `401` unauthenticated, `403` non-DOCTOR, `400` validation failure (including an inverted or zero-length interval), `404` the authenticated DOCTOR has no Doctor profile row, `409` overlaps an existing slot.

Scheduling uses the clinic timezone `Africa/Cairo`. Slots are individual local date/time intervals; adjacent slots are allowed. For the same doctor and date, an attempted slot overlaps when `newStart < existingEnd` and `newEnd > existingStart`; the service rejects it with `409`. Identical times on different dates, and identical slots owned by different doctors, are both allowed. The overlap check is service-level; the database independently enforces only `end_time > start_time` via a `CHECK` constraint, so two truly concurrent create requests for an overlapping slot could both pass the service check (a documented tradeoff of this milestone).

### DELETE /doctors/me/availability/:id

Authentication: Required — Role: DOCTOR

Purpose: Delete one of the authenticated doctor's own slots. Ownership flows strictly `req.user` → `Doctor` → `Availability`; another doctor's slot returns `403` without being deleted, and a booked slot cannot be deleted.

Response `204` No Content (empty body).

Errors: `401` unauthenticated, `403` non-DOCTOR or the slot belongs to another doctor, `400` malformed slot id, `404` the slot does not exist, `409` the slot is already booked.

---

## Appointments Module

An appointment consumes exactly one availability slot. A slot can hold **one non-cancelled appointment** — enforced by a PostgreSQL partial unique index (`availability_id` where `status <> 'CANCELLED'`), so two racing booking requests can never both succeed even if they hit the server simultaneously. Cancelling retains the appointment as history (`status = CANCELLED`), releases the slot back to `AVAILABLE`, and makes it bookable again.

Appointment lifecycle (a strict state machine):

```text
PENDING ──→ CONFIRMED ──→ COMPLETED
   │             │
   └─────────────┴──→ CANCELLED
```

Valid transitions: `PENDING → CONFIRMED`, `CONFIRMED → COMPLETED`, and `CANCELLED` reachable from `PENDING` or `CONFIRMED`. `COMPLETED` and `CANCELLED` are terminal. Invalid transitions return `409`.

Past appointments (slot end time already elapsed in clinic time, `Africa/Cairo`) are immutable — no status change and no cancellation — except that the owning doctor may still mark a past **`CONFIRMED`** appointment `COMPLETED`.

### POST /appointments

Authentication: Required — Role: PATIENT

Validation: `availabilityId` (UUID), `notes` (optional string, trimmed, max 1000 chars)

The patient is always resolved from the authenticated user (`req.user` → their own `Patient` row); client-supplied `patientId`, `doctorId`, or `status` fields do not exist in the contract and are ignored. The doctor comes from the selected availability slot.

Booking is atomic: the slot is conditionally claimed (`AVAILABLE → BOOKED`) and the appointment created inside one transaction. Two concurrent bookings of the same slot produce exactly one `201` and one `409`; the database partial unique index is the final backstop.

Request:
```json
{ "availabilityId": "uuid", "notes": "First visit" }
```

Response `201`: the created appointment.

```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "PENDING",
    "notes": "First visit",
    "createdAt": "timestamp",
    "updatedAt": "timestamp",
    "patient": { "id": "uuid", "fullName": "Jane Doe" },
    "doctor": {
      "id": "uuid",
      "fullName": "Dr. Who",
      "specialty": { "id": "uuid", "name": "Cardiology" }
    },
    "availability": {
      "id": "uuid",
      "date": "2030-09-01",
      "startTime": "09:30",
      "endTime": "11:00"
    }
  }
}
```

Errors: `401` unauthenticated, `403` non-PATIENT, `400` validation failure, `404` the slot does not exist, `409` the slot is no longer `AVAILABLE` (`"Appointment slot is already booked"`).

### GET /appointments/me

Authentication: Required — Role: PATIENT or DOCTOR

Purpose: List the caller's own appointments — as patient for a PATIENT, as doctor for a DOCTOR. The ownership filter is part of the database query; another user's appointments are never returned.

Query params: `page`, `limit`, `status` (optional enum: `PENDING | CONFIRMED | COMPLETED | CANCELLED`)

Response `200`: paginated appointments in the same shape as the create response above, ordered by slot date then start time.

```json
{
  "status": "success",
  "data": [ ... ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Errors: `401` unauthenticated, `403` ADMIN or other roles, `400` invalid query parameters.

### GET /appointments/:id

Authentication: Required — Role: PATIENT, DOCTOR, or ADMIN

ADMIN can view any appointment. A PATIENT sees only their own; a DOCTOR only their own. A non-owner receives `403` without any appointment data in the response.

Path param: `id` (UUID).

Response `200`: `{ "status": "success", "data": { ...appointment } }` in the create-response shape.

Errors: `401` unauthenticated, `403` not the owner (unless ADMIN), `400` malformed UUID, `404` not found.

### PATCH /appointments/:id/status

Authentication: Required — Role: DOCTOR (own appointments, any valid transition) or PATIENT (own appointments, cancel only). ADMIN is read-only for appointments.

Validation: `status` (enum: `CONFIRMED` | `CANCELLED` | `COMPLETED` — appointments start as `PENDING`, so it cannot be requested)

Rules:

* A doctor manages their own appointments: confirm (`PENDING → CONFIRMED`), complete (`CONFIRMED → COMPLETED`), or cancel.
* A patient may only cancel (`CANCELLED`) their own appointment. Attempting `CONFIRMED`/`COMPLETED` is a role violation → `403`.
* Another user's appointment is unreachable → `403`.
* An illegal transition (e.g. cancelling a `COMPLETED` appointment) → `409`.
* A past appointment rejects every modification except its own doctor marking a `CONFIRMED` appointment `COMPLETED` → otherwise `409`.

Cancelling atomically sets the appointment to `CANCELLED` and releases the slot back to `AVAILABLE` in the same transaction; the cancelled row is retained as history.

Request:
```json
{ "status": "CONFIRMED" }
```

Response `200`: the updated appointment in the standard shape.

Errors: `401` unauthenticated, `403` role/ownership mismatch, `400` validation failure (unknown status values), `404` appointment not found, `409` invalid transition or past-appointment modification.

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
