# Clinic Booking System — Frontend Integration Contract

> **IMPORTANT — Read First**
> This document was produced by inspecting every source file of the backend implementation.
> Every endpoint, field, status code, validation rule, enum value, error format, and configuration
> item documented here is derived directly from the source code.
> Nothing is invented or assumed.
> Items that cannot be determined from the code are explicitly labelled **UNKNOWN — requires developer decision**.
> Items that do not yet exist in the backend are labelled **PROPOSED — NOT CURRENTLY IMPLEMENTED**.

---

## Table of Contents

1. [Local Development Architecture](#1-local-development-architecture)
2. [Environment Variables](#2-environment-variables)
3. [Firebase Integration](#3-firebase-integration)
4. [Authentication & Authorization Contract](#4-authentication--authorization-contract)
5. [Complete API Contract](#5-complete-api-contract)
6. [API Inventory Table](#6-api-inventory-table)
7. [Enums](#7-enums)
8. [Validation Rules](#8-validation-rules)
9. [Pagination / Filtering / Sorting](#9-pagination--filtering--sorting)
10. [File Uploads](#10-file-uploads)
11. [Dates & Times](#11-dates--times)
12. [Error Handling Contract](#12-error-handling-contract)
13. [CORS Configuration](#13-cors-configuration)
14. [Network / API Client Expectations](#14-network--api-client-expectations)
15. [Frontend Implementation Requirements](#15-frontend-implementation-requirements)
16. [Known Integration Issues](#16-known-integration-issues)
17. [Missing Backend Capabilities](#17-missing-backend-capabilities)
18. [Integration Examples](#18-integration-examples)
19. [Instructions For The Frontend AI Agent](#19-instructions-for-the-frontend-ai-agent)

---

## 1. Local Development Architecture

```
Frontend:
http://localhost:5173   (Vite / React — assumed)
http://localhost:3000   (Next.js — also in CORS list)

Backend:
http://localhost:3000   (default PORT; confirmed from .env.example: PORT=3000)

API Base URL:
http://localhost:3000/api/v1

API Documentation (Swagger UI):
http://localhost:3000/api/docs

Raw OpenAPI JSON:
http://localhost:3000/api/docs.json

Health Check:
http://localhost:3000/api/v1/health
```

**Example complete API URL:**
```
http://localhost:3000/api/v1/auth/login
http://localhost:3000/api/v1/doctors?page=1&limit=10
```

**Protocol:** HTTP (no HTTPS configured for local development)

**Required backend port:** `3000` (default). Configured by the `PORT` environment variable.

**CORS:** The backend currently allows both `http://localhost:5173` and `http://localhost:3000` as origins with `credentials: true`. See [Section 13](#13-cors-configuration) for the full CORS analysis.

**Credentials:** `credentials: true` is set on the CORS middleware. The API uses `Authorization` HTTP headers (not cookies) for access tokens. The `cookie-parser` middleware is installed but **no cookies are currently set or read by any endpoint** — all token exchange happens in the request/response body.

**Firebase:** **NOT USED.** The backend has no Firebase dependency anywhere in the source code. Authentication is handled entirely via custom JWT tokens and bcrypt password hashing against a PostgreSQL database. There is no Firebase Admin SDK, no Firebase configuration, and no Firebase token verification in the backend.

---

## 2. Environment Variables

### Backend-Only Secrets (NEVER expose to the frontend)

| Variable | Purpose | Required | Example |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | **Required** | `postgresql://user:pass@localhost:5432/clinic_booking` |
| `JWT_SECRET` | HMAC-SHA256 signing key for JWT access tokens. Minimum 32 characters. | **Required** | `KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30` |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime | Optional | `15m` (default) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | Optional | `30d` (default) |
| `RATE_LIMIT_LOGIN_MAX` | Max login attempts per IP / 15 min | Optional | `10` (default) |
| `RATE_LIMIT_REGISTER_MAX` | Max register attempts per IP / 1 hr | Optional | `5` (default) |
| `RATE_LIMIT_REFRESH_MAX` | Max refresh attempts per IP / 15 min | Optional | `20` (default) |
| `NODE_ENV` | Runtime environment | Optional | `development` (default) |
| `PORT` | TCP port for the HTTP server | Optional | `3000` (default) |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins | Optional | `http://localhost:5173,http://localhost:3000` |

### Frontend-Safe Variables

The frontend only needs one variable: the backend API base URL.

```env
# Vite (React / Vue)
VITE_API_BASE_URL=http://localhost:3000/api/v1

# Next.js
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1

# Create React App
REACT_APP_API_BASE_URL=http://localhost:3000/api/v1
```

> **CAUTION:** The frontend must NEVER include `DATABASE_URL`, `JWT_SECRET`, or any other backend secret. These are backend-only.

---

## 3. Firebase Integration

**Firebase is NOT used in this backend.**

There is no Firebase dependency in `package.json`, no Firebase Admin SDK import in any source file, no Firebase token verification, and no Firebase configuration anywhere in the project.

- Authentication is handled via **custom JWT tokens** (signed with `JWT_SECRET` using `jsonwebtoken`).
- Passwords are hashed using **bcrypt** (`bcrypt` package).
- Data is stored in **PostgreSQL** via **Prisma ORM**.

The frontend must **NOT** implement Firebase authentication. It must use the `/api/v1/auth/*` endpoints described in this contract.

---

## 4. Authentication & Authorization Contract

### Authentication Technology

| Component | Technology |
|---|---|
| Access token | JSON Web Token (JWT), HS256, signed with `JWT_SECRET` |
| Refresh token | Opaque 96-character random hex string (48 random bytes, hex-encoded) |
| Password hashing | bcrypt |
| Token storage (server-side) | SHA-256 hash of the refresh token stored in PostgreSQL `RefreshToken` table |

### JWT Access Token Payload

```json
{
  "sub": "<user-uuid>",
  "role": "PATIENT | DOCTOR | ADMIN",
  "iat": 1234567890,
  "exp": 1234568790
}
```

### Authorization Header Format

```http
Authorization: Bearer <access-token>
```

This is the **only** authentication mechanism. There are no cookies, no sessions, no API keys.

### Complete Authentication Flow

```
REGISTRATION:
1. Frontend sends POST /api/v1/auth/register with email, password, fullName, role (PATIENT|DOCTOR), and optional specialtyId (required for DOCTOR).
2. Backend creates User + Doctor or Patient row in one transaction.
3. Backend returns { id, role } — NO TOKENS. The user is NOT logged in.
4. Frontend must redirect the user to a login page.

LOGIN:
1. Frontend sends POST /api/v1/auth/login with email and password.
2. Backend verifies credentials. After 5 consecutive failures, the account is locked for 15 minutes.
3. Backend returns { accessToken, refreshToken, user: { id, role } }.
4. Frontend stores the accessToken in memory (not localStorage — XSS risk).
5. Frontend stores the refreshToken securely (httpOnly cookie is recommended, but the backend does not set it — PROPOSED. Currently refreshToken is returned in the response body).
6. Frontend attaches the accessToken to every protected request: Authorization: Bearer <accessToken>.

TOKEN REFRESH:
1. When a request returns 401 (access token expired), the frontend sends POST /api/v1/auth/refresh with { refreshToken }.
2. Backend revokes the old refreshToken and issues a new { accessToken, refreshToken, user }.
3. Frontend updates its stored tokens.
4. CRITICAL: If a previously-used (rotated) refresh token is sent, the backend revokes the ENTIRE token family. The user is fully logged out.

LOGOUT:
1. Frontend sends POST /api/v1/auth/logout with { refreshToken } AND the access token in the Authorization header.
2. Backend revokes the entire refresh token family.
3. Frontend clears all stored tokens.

PROTECTED REQUEST:
1. Frontend attaches: Authorization: Bearer <accessToken>
2. Backend middleware (authenticate):
   a. Reads Authorization header.
   b. Verifies JWT signature and expiry.
   c. Extracts { sub, role } from payload.
   d. Loads user from DB; checks is_active == true.
   e. Attaches { id, role } to req.user.
3. If invalid → 401 Unauthorized.
```

### Role System

Three roles exist: `PATIENT`, `DOCTOR`, `ADMIN`.

Roles are mutually exclusive and set at registration time. A user cannot change their own role.

`ADMIN` accounts can only be created via the backend script (`npm run create-admin`), not through the public registration API.

### Public Endpoints (No Token Required)

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/doctors`
- `GET /api/v1/doctors/:id`
- `GET /api/v1/doctors/:doctorId/availability`
- `GET /api/v1/specialties`
- `GET /api/v1/specialties/:id`
- `GET /api/docs`
- `GET /api/docs.json`

### Authenticated Endpoints

All other endpoints require `Authorization: Bearer <accessToken>`.

### Authorization Matrix

| Endpoint | Public | PATIENT | DOCTOR | ADMIN |
|---|---|---|---|---|
| Register | ✓ | | | |
| Login | ✓ | | | |
| Refresh token | ✓ | | | |
| Logout | | ✓ | ✓ | ✓ |
| GET /users/me | | ✓ | ✓ | ✓ |
| GET /doctors | ✓ | ✓ | ✓ | ✓ |
| GET /doctors/:id | ✓ | ✓ | ✓ | ✓ |
| PATCH /doctors/me | | | ✓ | |
| PATCH /patients/me | | ✓ | | |
| GET /specialties | ✓ | ✓ | ✓ | ✓ |
| GET /specialties/:id | ✓ | ✓ | ✓ | ✓ |
| POST /specialties | | | | ✓ |
| PATCH /specialties/:id | | | | ✓ |
| DELETE /specialties/:id | | | | ✓ |
| GET /doctors/:doctorId/availability | ✓ | ✓ | ✓ | ✓ |
| POST /doctors/me/availability | | | ✓ | |
| DELETE /doctors/me/availability/:id | | | ✓ | |
| POST /appointments | | ✓ | | |
| GET /appointments/me | | ✓ | ✓ | |
| GET /appointments/:id | | ✓ (own only) | ✓ (own only) | ✓ (any) |
| PATCH /appointments/:id/status | | ✓ (cancel only) | ✓ (any valid) | |
| GET /admin/users | | | | ✓ |
| PATCH /admin/users/:id | | | | ✓ |
| GET /admin/appointments | | | | ✓ |

### Unauthorized / Forbidden Responses

```json
// 401 Unauthorized (missing or invalid access token)
{
  "status": "unauthorized",
  "message": "Authentication required"
}

// 401 Unauthorized (invalid/expired token)
{
  "status": "unauthorized",
  "message": "Invalid token"
}

// 403 Forbidden (authenticated but wrong role)
{
  "status": "forbidden",
  "message": "Insufficient Permissions"
}
```

### Account Lockout

After **5 consecutive failed login attempts**, the account is locked for **15 minutes**. All login failure scenarios (wrong password, unknown email, deactivated account, locked account) return the identical:

```json
{
  "status": "unauthorized",
  "message": "Invalid email or password"
}
```

The lockout state resets on the next successful login.

---

## 5. Complete API Contract

All endpoints are prefixed with `/api/v1`.

---

### 5.1 Health Check

#### `GET /api/v1/health`

**Purpose:** Verify the API server is running.

**Authentication:** Public

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "message": "ok"
  }
}
```

---

### 5.2 Auth Module — `/api/v1/auth`

---

#### `POST /api/v1/auth/register`

**Purpose:** Register a new PATIENT or DOCTOR account. Does not return tokens. No auto-login.

**Authentication:** Public

**Rate limit:** 5 requests per IP per hour.

**Content-Type:** `application/json`

**Request body:**
```json
{
  "email": "patient@example.com",
  "password": "SecurePass123",
  "fullName": "Jane Doe",
  "phone": "+201000000000",
  "role": "PATIENT"
}
```

For DOCTOR registration, `specialtyId` is **required**:
```json
{
  "email": "doctor@example.com",
  "password": "SecurePass123",
  "fullName": "Dr. John Smith",
  "phone": "+201000000001",
  "role": "DOCTOR",
  "specialtyId": "uuid-of-existing-specialty"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | Yes | Valid email format, trimmed, max 255 chars |
| `password` | string | Yes | 8–72 chars |
| `fullName` | string | Yes | Non-empty, trimmed, max 150 chars |
| `phone` | string | No | Max 30 chars |
| `role` | enum | Yes | `PATIENT` or `DOCTOR` only. `ADMIN` is not accepted. |
| `specialtyId` | UUID string | Conditional | Required when `role == "DOCTOR"`. Must be an existing specialty UUID. |

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "role": "PATIENT"
  }
}
```

**Status Codes:**
- `201` — User created successfully
- `400` — Validation failure (invalid email, short password, missing role, missing specialtyId for DOCTOR, etc.)
- `404` — `specialtyId` references a specialty that does not exist
- `409` — Email is already registered
- `429` — Rate limit exceeded

---

#### `POST /api/v1/auth/login`

**Purpose:** Authenticate user and receive access + refresh tokens.

**Authentication:** Public

**Rate limit:** 10 requests per IP per 15 minutes.

**Content-Type:** `application/json`

**Request body:**
```json
{
  "email": "patient@example.com",
  "password": "SecurePass123"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | Yes | Valid email format |
| `password` | string | Yes | Non-empty string |

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "a1b2c3d4e5f6...(96-char hex string)",
    "user": {
      "id": "uuid",
      "role": "PATIENT"
    }
  }
}
```

**Status Codes:**
- `200` — Login successful
- `400` — Validation failure
- `401` — Invalid credentials (also: account locked, account deactivated — all return the same message)
- `429` — Rate limit exceeded

---

#### `POST /api/v1/auth/refresh`

**Purpose:** Exchange a valid refresh token for a new access + refresh token pair. The submitted token is revoked (single-use rotation).

**Authentication:** Public (no access token required)

**Rate limit:** 20 requests per IP per 15 minutes.

**Content-Type:** `application/json`

**Request body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6...(96-char hex string)"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `refreshToken` | string | Yes | Non-empty, max 256 chars |

**Response `200`:** Same shape as login response.
```json
{
  "status": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "new-96-char-hex-string",
    "user": {
      "id": "uuid",
      "role": "PATIENT"
    }
  }
}
```

**Status Codes:**
- `200` — Tokens rotated
- `400` — Validation failure (empty token)
- `401` — Token unknown, expired, already revoked, or belongs to a deactivated user. A revoked token triggers full family revocation.
- `429` — Rate limit exceeded

---

#### `POST /api/v1/auth/logout`

**Purpose:** Revoke the refresh token's entire family, ending all sessions derived from it.

**Authentication:** Required (any role) — access token in `Authorization` header

**Content-Type:** `application/json`

**Request body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6...(96-char hex string)"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `refreshToken` | string | Yes | Non-empty, max 256 chars |

**Response `204`:** No content (empty body).

**Status Codes:**
- `204` — Logged out successfully
- `400` — Validation failure
- `401` — Missing/invalid access token, or the refresh token does not belong to the authenticated user

---

### 5.3 Users Module

---

#### `GET /api/v1/users/me`

**Purpose:** Get the authenticated user's account data merged with their role-specific profile.

**Authentication:** Required (any role)

**Request:** No body, no query params.

**Response `200` — PATIENT:**
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
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z",
    "patient": {
      "id": "uuid",
      "dateOfBirth": "1995-06-15"
    }
  }
}
```

**Response `200` — DOCTOR:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "doctor@example.com",
    "fullName": "Dr. John Smith",
    "phone": "+201000000001",
    "role": "DOCTOR",
    "isActive": true,
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z",
    "doctor": {
      "id": "uuid",
      "specialty": {
        "id": "uuid",
        "name": "Cardiology"
      },
      "bio": "Short professional bio"
    }
  }
}
```

**Response `200` — ADMIN:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "admin@example.com",
    "fullName": "Admin User",
    "phone": null,
    "role": "ADMIN",
    "isActive": true,
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z"
  }
}
```

Notes:
- A PATIENT response always has a `patient` key; a DOCTOR response always has a `doctor` key; ADMIN has neither.
- `dateOfBirth` is a date-only `YYYY-MM-DD` string, or `null` if not set.
- `phone` may be `null`.
- The response never includes `password_hash`, `failed_login_count`, `locked_until`, or any token material.
- `createdAt` and `updatedAt` are full ISO 8601 timestamps with timezone (`Timestamptz` in DB).

**Status Codes:**
- `200` — Success
- `401` — Missing or invalid access token, or account deactivated
- `404` — The authenticated user's role profile row is missing (data integrity error)

---

### 5.4 Doctors Module

---

#### `GET /api/v1/doctors`

**Purpose:** Paginated list of all doctors, with optional specialty filter.

**Authentication:** Public

**Query parameters:**

| Param | Type | Required | Default | Rules |
|---|---|---|---|---|
| `page` | integer | No | `1` | Min 1 |
| `limit` | integer | No | `10` | Min 1, max 100 |
| `specialty` | string | No | — | Matches specialty name (case-insensitive contains) or specialty UUID. Unknown value returns empty page, not error. |

**Response `200`:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "fullName": "Dr. John Smith",
      "specialty": {
        "id": "uuid",
        "name": "Cardiology"
      },
      "bio": "Short professional bio"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

Notes:
- `bio` may be `null`.

**Status Codes:**
- `200` — Success (empty `data: []` if no doctors match)
- `400` — Invalid query parameters

---

#### `GET /api/v1/doctors/:id`

**Purpose:** Get a single doctor by UUID.

**Authentication:** Public

**Path parameters:**

| Param | Type | Required | Rules |
|---|---|---|---|
| `id` | UUID string | Yes | Must be a valid UUID |

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "fullName": "Dr. John Smith",
    "specialty": {
      "id": "uuid",
      "name": "Cardiology"
    },
    "bio": "Short professional bio"
  }
}
```

**Status Codes:**
- `200` — Success
- `400` — Malformed UUID
- `404` — Doctor not found

---

#### `PATCH /api/v1/doctors/me`

**Purpose:** Update the authenticated doctor's own profile (bio and/or specialty).

**Authentication:** Required — Role: `DOCTOR`

**Content-Type:** `application/json`

**Request body (all fields optional; empty body is a valid no-op):**
```json
{
  "bio": "Updated professional bio",
  "specialtyId": "uuid-of-new-specialty"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `bio` | string | No | Trimmed, non-empty if provided, max 1000 chars |
| `specialtyId` | UUID string | No | Must reference an existing specialty |

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "fullName": "Dr. John Smith",
    "specialty": {
      "id": "uuid",
      "name": "Neurology"
    },
    "bio": "Updated professional bio"
  }
}
```

**Status Codes:**
- `200` — Updated successfully
- `400` — Validation failure
- `401` — Not authenticated
- `403` — Not a DOCTOR
- `404` — `specialtyId` does not exist, or the authenticated user has no Doctor profile row

---

### 5.5 Patients Module

---

#### `PATCH /api/v1/patients/me`

**Purpose:** Update the authenticated patient's own profile. Partial PATCH — only supplied fields change.

**Authentication:** Required — Role: `PATIENT`

**Content-Type:** `application/json`

**Request body (all fields optional; empty body is a valid no-op):**
```json
{
  "fullName": "Jane Doe",
  "phone": "+201000000000",
  "dateOfBirth": "1995-06-15"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `fullName` | string | No | Trimmed, non-empty if provided, max 150 chars |
| `phone` | string | No | Trimmed, max 30 chars |
| `dateOfBirth` | string | No | Exactly `YYYY-MM-DD` format, must be a real calendar date |

**Response `200`:** Same shape as `GET /users/me` for a PATIENT.
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
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z",
    "patient": {
      "id": "uuid",
      "dateOfBirth": "1995-06-15"
    }
  }
}
```

**Status Codes:**
- `200` — Updated successfully
- `400` — Validation failure (invalid date format, phone too long, etc.)
- `401` — Not authenticated
- `403` — Not a PATIENT (DOCTOR or ADMIN)
- `404` — The authenticated user has no Patient profile row (data integrity error)

---

### 5.6 Specialties Module

---

#### `GET /api/v1/specialties`

**Purpose:** Paginated list of all medical specialties, with optional name search.

**Authentication:** Public

**Query parameters:**

| Param | Type | Required | Default | Rules |
|---|---|---|---|---|
| `page` | integer | No | `1` | Min 1 |
| `limit` | integer | No | `10` | Min 1, max 100 |
| `search` | string | No | — | Trimmed. Case-insensitive contains match on specialty name. |

**Response `200`:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "name": "Cardiology",
      "created_at": "2026-09-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

> **Note on field naming:** The specialty object returned from the repository uses `created_at` (snake_case), not `createdAt` (camelCase). This is different from all other response objects in the API. The frontend must use `created_at` for specialties.

Results are ordered by name ascending.

**Status Codes:**
- `200` — Success (empty `data: []` if none match)
- `400` — Invalid query parameters

---

#### `GET /api/v1/specialties/:id`

**Purpose:** Get a single specialty by UUID.

**Authentication:** Public

**Path parameters:**

| Param | Type | Required | Rules |
|---|---|---|---|
| `id` | UUID string | Yes | Must be a valid UUID |

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Cardiology",
    "created_at": "2026-09-01T10:00:00.000Z"
  }
}
```

**Status Codes:**
- `200` — Success
- `400` — Malformed UUID
- `404` — Specialty not found

---

#### `POST /api/v1/specialties`

**Purpose:** Create a new specialty. Admin only.

**Authentication:** Required — Role: `ADMIN`

**Content-Type:** `application/json`

**Request body:**
```json
{
  "name": "Cardiology"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | Yes | Trimmed, 2–100 chars, letters/spaces/hyphens/ampersands only |

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Cardiology",
    "created_at": "2026-09-01T10:00:00.000Z"
  }
}
```

**Status Codes:**
- `201` — Created
- `400` — Validation failure
- `401` — Not authenticated
- `403` — Not ADMIN
- `409` — Specialty name already exists

---

#### `PATCH /api/v1/specialties/:id`

**Purpose:** Update an existing specialty name. Admin only.

**Authentication:** Required — Role: `ADMIN`

**Content-Type:** `application/json`

**Path parameters:** `id` (UUID)

**Request body:**
```json
{
  "name": "Neurology"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | **Yes** | Trimmed, 2–100 chars. Note: unlike create, the character allowlist check is NOT applied on update (only min/max length). |

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Neurology",
    "created_at": "2026-09-01T10:00:00.000Z"
  }
}
```

**Status Codes:**
- `200` — Updated
- `400` — Validation failure
- `401` — Not authenticated
- `403` — Not ADMIN
- `404` — Specialty not found
- `409` — Name belongs to a different specialty

---

#### `DELETE /api/v1/specialties/:id`

**Purpose:** Delete a specialty. Admin only. Fails if any doctor is currently assigned to it.

**Authentication:** Required — Role: `ADMIN`

**Path parameters:** `id` (UUID)

**Response `204`:** No content.

**Status Codes:**
- `204` — Deleted
- `401` — Not authenticated
- `403` — Not ADMIN
- `404` — Specialty not found
- `409` — A doctor is still assigned to this specialty

---

### 5.7 Availability Module

> **Important — Timezone:** All date and time values are clinic-local wall-clock values in the `Africa/Cairo` timezone. The frontend must display them as-is without UTC conversion. See [Section 11](#11-dates--times).

---

#### `GET /api/v1/doctors/:doctorId/availability`

**Purpose:** List a doctor's `AVAILABLE` slots. Booked slots are never returned.

**Authentication:** Public

**Path parameters:**

| Param | Type | Required | Rules |
|---|---|---|---|
| `doctorId` | UUID string | Yes | Must be a valid UUID |

**Query parameters:**

| Param | Type | Required | Rules |
|---|---|---|---|
| `from` | string | No | `YYYY-MM-DD` format. Inclusive lower bound on slot date. |
| `to` | string | No | `YYYY-MM-DD` format. Inclusive upper bound on slot date. When both provided, `to` must not be earlier than `from`. |

**Response `200`:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "date": "2026-09-01",
      "startTime": "09:30",
      "endTime": "11:00"
    }
  ]
}
```

Notes:
- Response is **not paginated** — always returns an array directly (no `meta`).
- Empty array `[]` is returned when no matching available slots exist (not an error).
- Results are ordered by date ascending, then by start time ascending.
- `status` field of the availability is NOT included in the response (only AVAILABLE slots are returned).

**Status Codes:**
- `200` — Success
- `400` — Malformed UUID or invalid date params (`to` earlier than `from`)
- `404` — Doctor not found

---

#### `POST /api/v1/doctors/me/availability`

**Purpose:** Create an availability slot for the authenticated doctor.

**Authentication:** Required — Role: `DOCTOR`

**Content-Type:** `application/json`

**Request body:**
```json
{
  "date": "2026-09-01",
  "startTime": "09:30",
  "endTime": "11:00"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `date` | string | Yes | Exactly `YYYY-MM-DD`. Must be a real calendar date. |
| `startTime` | string | Yes | Exactly `HH:mm` 24-hour format (e.g., `09:30`, `14:00`). |
| `endTime` | string | Yes | Exactly `HH:mm` 24-hour format. Must be strictly after `startTime`. |

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "date": "2026-09-01",
    "startTime": "09:30",
    "endTime": "11:00"
  }
}
```

**Status Codes:**
- `201` — Created
- `400` — Validation failure (invalid format, `endTime` not after `startTime`)
- `401` — Not authenticated
- `403` — Not a DOCTOR
- `404` — The authenticated DOCTOR has no Doctor profile row
- `409` — New slot overlaps with an existing slot for the same doctor on the same date

---

#### `DELETE /api/v1/doctors/me/availability/:id`

**Purpose:** Delete one of the authenticated doctor's own availability slots.

**Authentication:** Required — Role: `DOCTOR`

**Path parameters:**

| Param | Type | Required | Rules |
|---|---|---|---|
| `id` | UUID string | Yes | The availability slot UUID |

**Response `204`:** No content.

**Status Codes:**
- `204` — Deleted
- `400` — Malformed UUID
- `401` — Not authenticated
- `403` — Not a DOCTOR, or the slot belongs to a different doctor
- `404` — Slot not found
- `409` — The slot is currently `BOOKED` (an active appointment exists for it)

---

### 5.8 Appointments Module

---

#### `POST /api/v1/appointments`

**Purpose:** Book an available slot. Patient only. The patient identity comes from the access token — NOT from the request body.

**Authentication:** Required — Role: `PATIENT`

**Content-Type:** `application/json`

**Request body:**
```json
{
  "availabilityId": "uuid-of-availability-slot",
  "notes": "First visit"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `availabilityId` | UUID string | Yes | Must reference an existing AVAILABLE slot |
| `notes` | string | No | Trimmed, max 1000 chars |

> Do NOT include `patientId`, `doctorId`, or `status` in the request body. These are ignored by the backend and will not cause errors, but they have no effect. The patient comes from the access token; the doctor comes from the availability slot.

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "PENDING",
    "notes": "First visit",
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z",
    "patient": {
      "id": "uuid",
      "fullName": "Jane Doe"
    },
    "doctor": {
      "id": "uuid",
      "fullName": "Dr. John Smith",
      "specialty": {
        "id": "uuid",
        "name": "Cardiology"
      }
    },
    "availability": {
      "id": "uuid",
      "date": "2026-09-01",
      "startTime": "09:30",
      "endTime": "11:00"
    }
  }
}
```

**Status Codes:**
- `201` — Booked
- `400` — Validation failure
- `401` — Not authenticated
- `403` — Not a PATIENT
- `404` — Availability slot does not exist, or the authenticated user has no Patient profile row
- `409` — The slot is already booked (`"Appointment slot is already booked"`)

---

#### `GET /api/v1/appointments/me`

**Purpose:** List the authenticated user's own appointments. For PATIENT: their bookings. For DOCTOR: appointments on their slots.

**Authentication:** Required — Role: `PATIENT` or `DOCTOR`

**Query parameters:**

| Param | Type | Required | Default | Rules |
|---|---|---|---|---|
| `page` | integer | No | `1` | Min 1 |
| `limit` | integer | No | `10` | Min 1, max 100 |
| `status` | enum | No | — | `PENDING`, `CONFIRMED`, `COMPLETED`, or `CANCELLED` |

**Response `200`:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "status": "PENDING",
      "notes": "First visit",
      "createdAt": "2026-09-01T10:00:00.000Z",
      "updatedAt": "2026-09-01T10:00:00.000Z",
      "patient": {
        "id": "uuid",
        "fullName": "Jane Doe"
      },
      "doctor": {
        "id": "uuid",
        "fullName": "Dr. John Smith",
        "specialty": {
          "id": "uuid",
          "name": "Cardiology"
        }
      },
      "availability": {
        "id": "uuid",
        "date": "2026-09-01",
        "startTime": "09:30",
        "endTime": "11:00"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

**Status Codes:**
- `200` — Success
- `400` — Invalid query parameters
- `401` — Not authenticated
- `403` — ADMIN or unsupported role

---

#### `GET /api/v1/appointments/:id`

**Purpose:** Get a single appointment by UUID. ADMIN can view any. PATIENT/DOCTOR can only view their own.

**Authentication:** Required — Role: `PATIENT`, `DOCTOR`, or `ADMIN`

**Path parameters:** `id` (UUID)

**Response `200`:** Same appointment shape as book response above.

**Status Codes:**
- `200` — Success
- `400` — Malformed UUID
- `401` — Not authenticated
- `403` — Not the owner (for non-ADMIN)
- `404` — Appointment not found

---

#### `PATCH /api/v1/appointments/:id/status`

**Purpose:** Update the status of an appointment. DOCTOR can apply any valid transition. PATIENT can only cancel.

**Authentication:** Required — Role: `PATIENT` (cancel only) or `DOCTOR` (any valid transition)

**Content-Type:** `application/json`

**Path parameters:** `id` (UUID)

**Request body:**
```json
{
  "status": "CONFIRMED"
}
```

| Field | Type | Required | Allowed values |
|---|---|---|---|
| `status` | enum | Yes | `CONFIRMED`, `CANCELLED`, `COMPLETED` — note: `PENDING` is **not** accepted (initial status is set by the backend on creation) |

**Appointment state machine:**
```
PENDING ──→ CONFIRMED ──→ COMPLETED
   │             │
   └─────────────┴──→ CANCELLED
```

**Role restrictions:**
- `PATIENT` — may only send `CANCELLED` for their own appointment.
- `DOCTOR` — may send `CONFIRMED`, `COMPLETED`, or `CANCELLED` for their own appointments, subject to valid transitions.
- `ADMIN` — read-only for appointments; cannot call this endpoint.

**Past-appointment rule:**
- If the slot's end time has already passed (in `Africa/Cairo` timezone), modifications are rejected with `409`.
- **Exception:** A DOCTOR may still mark a `CONFIRMED` past appointment as `COMPLETED`.

**Response `200`:** Updated appointment in the standard shape.

**Status Codes:**
- `200` — Updated
- `400` — Validation failure (invalid status value)
- `401` — Not authenticated
- `403` — Role/ownership mismatch (PATIENT attempting CONFIRMED/COMPLETED, wrong owner, or ADMIN)
- `404` — Appointment not found
- `409` — Invalid state transition, or past-appointment modification attempt

---

### 5.9 Admin Module — `/api/v1/admin`

All admin endpoints require `authenticate + requireRole('ADMIN')`.

---

#### `GET /api/v1/admin/users`

**Purpose:** Paginated list of all users with optional filters.

**Authentication:** Required — Role: `ADMIN`

**Query parameters:**

| Param | Type | Required | Default | Rules |
|---|---|---|---|---|
| `page` | integer | No | `1` | Min 1 |
| `limit` | integer | No | `10` | Min 1, max 100 |
| `role` | enum | No | — | `PATIENT`, `DOCTOR`, or `ADMIN` |
| `isActive` | string | No | — | `"true"` or `"false"` (string, not boolean — sent as query param) |

**Response `200`:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "Jane Doe",
      "phone": "+201000000000",
      "role": "PATIENT",
      "isActive": true,
      "createdAt": "2026-09-01T10:00:00.000Z",
      "updatedAt": "2026-09-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

**Status Codes:**
- `200` — Success
- `400` — Invalid query parameters
- `401` — Not authenticated
- `403` — Not ADMIN

---

#### `PATCH /api/v1/admin/users/:id`

**Purpose:** Update a user's account details (name, phone, active status). If `isActive: false`, all the user's active refresh tokens are revoked.

**Authentication:** Required — Role: `ADMIN`

**Content-Type:** `application/json`

**Path parameters:** `id` (UUID — the user to update)

**Request body (all fields optional; empty body returns current user without modification):**
```json
{
  "fullName": "Updated Name",
  "phone": "+201000000002",
  "isActive": false
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `fullName` | string | No | Trimmed, non-empty if provided, max 150 chars |
| `phone` | string | No | Trimmed, max 30 chars |
| `isActive` | boolean | No | `true` or `false` |

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Updated Name",
    "phone": "+201000000002",
    "role": "PATIENT",
    "isActive": false,
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:05:00.000Z"
  }
}
```

**Status Codes:**
- `200` — Updated
- `400` — Validation failure
- `401` — Not authenticated
- `403` — Not ADMIN
- `404` — User not found

---

#### `GET /api/v1/admin/appointments`

**Purpose:** Read-only oversight of all appointments in the system.

**Authentication:** Required — Role: `ADMIN`

**Query parameters:**

| Param | Type | Required | Default | Rules |
|---|---|---|---|---|
| `page` | integer | No | `1` | Min 1 |
| `limit` | integer | No | `10` | Min 1, max 100 |
| `status` | enum | No | — | `PENDING`, `CONFIRMED`, `COMPLETED`, or `CANCELLED` |
| `doctorId` | UUID | No | — | Filter by doctor UUID |
| `patientId` | UUID | No | — | Filter by patient UUID |

**Response `200`:** Same paginated appointment list shape as `GET /appointments/me`.

**Status Codes:**
- `200` — Success
- `400` — Invalid query parameters
- `401` — Not authenticated
- `403` — Not ADMIN

---

## 6. API Inventory Table

| Feature | Method | Endpoint | Auth | Role | Notes |
|---|---|---|---|---|---|
| Health Check | GET | `/api/v1/health` | Public | — | |
| Register | POST | `/api/v1/auth/register` | Public | — | Rate limited: 5/hr/IP |
| Login | POST | `/api/v1/auth/login` | Public | — | Rate limited: 10/15min/IP |
| Refresh Token | POST | `/api/v1/auth/refresh` | Public | — | Rate limited: 20/15min/IP |
| Logout | POST | `/api/v1/auth/logout` | Bearer token | Any | Access token + refresh token in body |
| Get Current User | GET | `/api/v1/users/me` | Bearer token | Any | |
| List Doctors | GET | `/api/v1/doctors` | Public | — | Paginated; `specialty` filter |
| Get Doctor | GET | `/api/v1/doctors/:id` | Public | — | |
| Update Doctor Profile | PATCH | `/api/v1/doctors/me` | Bearer token | DOCTOR | |
| Update Patient Profile | PATCH | `/api/v1/patients/me` | Bearer token | PATIENT | |
| List Specialties | GET | `/api/v1/specialties` | Public | — | Paginated; `search` filter |
| Get Specialty | GET | `/api/v1/specialties/:id` | Public | — | |
| Create Specialty | POST | `/api/v1/specialties` | Bearer token | ADMIN | |
| Update Specialty | PATCH | `/api/v1/specialties/:id` | Bearer token | ADMIN | |
| Delete Specialty | DELETE | `/api/v1/specialties/:id` | Bearer token | ADMIN | |
| List Doctor Availability | GET | `/api/v1/doctors/:doctorId/availability` | Public | — | Not paginated; `from`/`to` filter |
| Create Availability Slot | POST | `/api/v1/doctors/me/availability` | Bearer token | DOCTOR | |
| Delete Availability Slot | DELETE | `/api/v1/doctors/me/availability/:id` | Bearer token | DOCTOR | |
| Book Appointment | POST | `/api/v1/appointments` | Bearer token | PATIENT | |
| List My Appointments | GET | `/api/v1/appointments/me` | Bearer token | PATIENT, DOCTOR | Paginated; `status` filter |
| Get Appointment | GET | `/api/v1/appointments/:id` | Bearer token | PATIENT (own), DOCTOR (own), ADMIN (any) | |
| Update Appointment Status | PATCH | `/api/v1/appointments/:id/status` | Bearer token | PATIENT (cancel only), DOCTOR | |
| Admin: List Users | GET | `/api/v1/admin/users` | Bearer token | ADMIN | Paginated; `role`, `isActive` filters |
| Admin: Update User | PATCH | `/api/v1/admin/users/:id` | Bearer token | ADMIN | |
| Admin: List All Appointments | GET | `/api/v1/admin/appointments` | Bearer token | ADMIN | Paginated; `status`, `doctorId`, `patientId` filters |
| Swagger UI | GET | `/api/docs` | Public | — | Interactive API docs |
| OpenAPI JSON | GET | `/api/docs.json` | Public | — | Machine-readable spec |

---

## 7. Enums

The frontend must use these exact string values when sending data to the backend.

### Role

```
PATIENT
DOCTOR
ADMIN
```

Used in: registration `role` field, query filters on admin `/users`, and the `role` field returned in all user/profile responses.

> `ADMIN` cannot be used in the registration request — only `PATIENT` and `DOCTOR` are accepted.

### AppointmentStatus

```
PENDING      — Initial state after booking. Set by the backend automatically.
CONFIRMED    — Doctor has confirmed the appointment.
COMPLETED    — Doctor has marked the appointment completed.
CANCELLED    — Appointment cancelled by patient or doctor.
```

**Valid status update transitions:**
- `PENDING → CONFIRMED` (DOCTOR only)
- `PENDING → CANCELLED` (PATIENT or DOCTOR)
- `CONFIRMED → COMPLETED` (DOCTOR only)
- `CONFIRMED → CANCELLED` (PATIENT or DOCTOR)
- `COMPLETED → *` (terminal — no transitions allowed)
- `CANCELLED → *` (terminal — no transitions allowed)

**Values accepted in `PATCH /appointments/:id/status`:** `CONFIRMED`, `CANCELLED`, `COMPLETED` — `PENDING` is **not accepted**.

Used in: appointment responses, `GET /appointments/me?status=`, `GET /admin/appointments?status=`.

### AvailabilityStatus (internal — not exposed to frontend in responses)

```
AVAILABLE    — The slot can be booked.
BOOKED       — The slot has an active appointment.
```

> The `status` field of availability slots is never included in the API response. The `GET /doctors/:doctorId/availability` endpoint only ever returns `AVAILABLE` slots.

---

## 8. Validation Rules

### User Fields

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | Yes | Valid email, trimmed, max 255 chars |
| `password` | string | Yes (register) | 8–72 chars (bcrypt limit) |
| `fullName` | string | Yes (register) | Non-empty, trimmed, max 150 chars |
| `phone` | string | No | Trimmed, max 30 chars |
| `role` | enum | Yes (register) | `PATIENT` or `DOCTOR` only |
| `specialtyId` | UUID | Conditional | Required only when `role == "DOCTOR"`. Must be a valid UUID and reference an existing specialty. |

### Doctor-Specific

| Field | Type | Required | Rules |
|---|---|---|---|
| `bio` | string | No | Trimmed, non-empty if provided, max 1000 chars |
| `specialtyId` | UUID | No | Valid UUID, must reference an existing specialty |

### Patient-Specific

| Field | Type | Required | Rules |
|---|---|---|---|
| `fullName` | string | No | Trimmed, non-empty if provided, max 150 chars |
| `phone` | string | No | Trimmed, max 30 chars |
| `dateOfBirth` | string | No | Exactly `YYYY-MM-DD`. Must be a real calendar date. |

### Specialty

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` (create) | string | Yes | Trimmed, 2–100 chars, letters/spaces/hyphens/ampersands only (`a-z A-Z spaces - &`) |
| `name` (update) | string | **Yes** | Trimmed, 2–100 chars (character allowlist NOT applied on update) |

### Availability

| Field | Type | Required | Rules |
|---|---|---|---|
| `date` | string | Yes | `YYYY-MM-DD` format. Real calendar date. |
| `startTime` | string | Yes | `HH:mm` 24-hour (e.g., `09:30`, `23:59`). |
| `endTime` | string | Yes | `HH:mm` 24-hour. Must be strictly after `startTime`. |

### Appointment

| Field | Type | Required | Rules |
|---|---|---|---|
| `availabilityId` | UUID | Yes | Must reference an existing availability slot |
| `notes` | string | No | Trimmed, max 1000 chars |
| `status` (update) | enum | Yes | `CONFIRMED`, `CANCELLED`, or `COMPLETED` |

### Pagination Parameters (universal)

| Param | Type | Default | Rules |
|---|---|---|---|
| `page` | integer | `1` | Min 1 |
| `limit` | integer | `10` | Min 1, max 100 |

---

## 9. Pagination / Filtering / Sorting

### General Pagination

All paginated endpoints accept `page` and `limit` query parameters.

```
GET /api/v1/doctors?page=1&limit=20
GET /api/v1/appointments/me?page=2&limit=5
```

**Defaults:** `page=1`, `limit=10`  
**Limit cap:** `100`

All paginated responses include a `meta` object:

```json
{
  "status": "success",
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

### Non-paginated Endpoints

`GET /api/v1/doctors/:doctorId/availability` — returns a flat array in `data`. No `meta` object.

### Filtering

| Endpoint | Filter Param | Description |
|---|---|---|
| `GET /doctors` | `specialty` | Case-insensitive contains match on specialty name, OR match on specialty UUID |
| `GET /specialties` | `search` | Case-insensitive contains match on specialty name |
| `GET /appointments/me` | `status` | Exact enum match: `PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED` |
| `GET /doctors/:doctorId/availability` | `from` | Inclusive lower date bound (`YYYY-MM-DD`) |
| `GET /doctors/:doctorId/availability` | `to` | Inclusive upper date bound (`YYYY-MM-DD`) |
| `GET /admin/users` | `role` | Exact enum match: `PATIENT`, `DOCTOR`, `ADMIN` |
| `GET /admin/users` | `isActive` | String `"true"` or `"false"` |
| `GET /admin/appointments` | `status` | Exact enum match |
| `GET /admin/appointments` | `doctorId` | UUID |
| `GET /admin/appointments` | `patientId` | UUID |

### Sorting

Sorting is **not configurable by the frontend**. The backend uses fixed ordering:
- Specialties: `name` ascending
- Availability slots: date ascending, then start time ascending (applied in the repository)
- Doctors: UNKNOWN — requires developer decision (not explicitly set in repository)
- Appointments: UNKNOWN — requires developer decision

---

## 10. File Uploads

**File uploads are NOT implemented in this backend.**

There is no `multipart/form-data` handling, no `multer` or similar library, no image storage, and no file upload endpoint anywhere in the codebase.

If the frontend requires profile image uploads or document attachments, this is a **missing backend capability** — see [Section 17](#17-missing-backend-capabilities).

---

## 11. Dates & Times

### Timezone

The clinic operates on a fixed **`Africa/Cairo`** timezone. This is hardcoded in the backend business logic (specifically in `src/utils/clinic-time.js` which is used for past-appointment detection).

### Date-Only Fields

Used for: `dateOfBirth` (Patient), `date` (Availability slot).

- **Format:** `YYYY-MM-DD`
- **Request:** Send as a string: `"1995-06-15"`
- **Response:** Returned as a string: `"1995-06-15"`
- **Storage:** PostgreSQL `DATE` column stored at UTC midnight.
- **Frontend rule:** Display as-is. Do NOT convert through a timezone. The value is a plain calendar date.

### Time-Only Fields

Used for: `startTime`, `endTime` (Availability slot).

- **Format:** `HH:mm` (24-hour, no seconds)
- **Request:** Send as a string: `"09:30"`, `"14:00"`
- **Response:** Returned as a string: `"09:30"`, `"14:00"`
- **Timezone:** These are clinic-local wall-clock times (`Africa/Cairo`). Do NOT convert to UTC.
- **Frontend rule:** Display as-is. Do NOT apply timezone conversion.

### Full Timestamps

Used for: `createdAt`, `updatedAt` on users, doctors, appointments, specialties, availability.

- **Format:** Full ISO 8601 with timezone offset, as produced by JavaScript `Date.toISOString()`.
- **Example:** `"2026-09-01T10:00:00.000Z"`
- **Storage:** PostgreSQL `Timestamptz(6)` column.
- **Frontend rule:** Parse and display according to the user's local timezone using standard date libraries.

> **Note on specialty timestamp field name:** The specialty object uses `created_at` (snake_case), not `createdAt` (camelCase). All other objects use `createdAt` / `updatedAt` camelCase. This inconsistency is documented in [Section 16](#16-known-integration-issues).

---

## 12. Error Handling Contract

### Standard Error Shape

All errors (except rate limit errors) use this structure:

```json
{
  "status": "error | unauthorized | forbidden | not_found | conflict | validation_error | unprocessable_entity | error",
  "message": "Human-readable error message"
}
```

In development mode (`NODE_ENV=development`), an additional `stack` field is included.

### Validation Error Shape (400)

```json
{
  "status": "validation_error",
  "message": "Request validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Must be valid email",
      "code": "invalid_string"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 charachters",
      "code": "too_small"
    }
  ]
}
```

### Rate Limit Error Shape (429)

Note: The rate limiter response does NOT use the standard `status` field wrapper.

```json
{
  "message": "Too many requests. Please try again later."
}
```

### HTTP Status Codes and `status` Values

| HTTP Status | `status` Field Value | Common Causes |
|---|---|---|
| `200` | `"success"` | Successful GET, PATCH, PUT |
| `201` | `"success"` | Successful POST creation |
| `204` | (no body) | Successful DELETE or logout |
| `400` | `"validation_error"` | Failed Zod validation |
| `401` | `"unauthorized"` | Missing/invalid/expired access token, wrong credentials, locked account |
| `403` | `"forbidden"` | Authenticated but insufficient role or ownership |
| `404` | `"not_found"` | Resource does not exist |
| `409` | `"conflict"` | Duplicate resource, business rule violation (slot already booked, invalid transition, etc.) |
| `429` | N/A (no `status` field) | Rate limit exceeded |
| `500` | `"error"` | Unexpected server error |

### Prisma Database Error Mapping

| Prisma Code | HTTP Status | Message |
|---|---|---|
| `P2002` (unique violation) | `409` | `"a resource with provided value already exists"` |
| `P2003` (FK violation) | `409` | `"The resource cannot be deleted because it is still referenced"` |
| `P2025` (record not found) | `404` | `"The requested resource was not found"` |

### Frontend Error Handling Requirements

1. **400:** Show the `errors` array field-by-field next to form inputs.
2. **401:** Clear tokens and redirect to login.
3. **403:** Show a "not permitted" message. Do not retry.
4. **404:** Show a "not found" message.
5. **409:** Show the `message` as a user-facing conflict notification.
6. **429:** Show a "try again later" message and disable the button temporarily.
7. **500:** Show a generic "server error" message. Do not expose technical details to the user.

---

## 13. CORS Configuration

### Current Implementation

From `src/app.js`:

```javascript
app.use(cors({ origin: config.corsOrigin }));  // First cors call
// ...
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));  // Second cors call (effective)
```

**There is a bug: `cors()` is called twice.** The first call (`app.use(cors({ origin: config.corsOrigin }))`) runs before the second call. In Express, the first matching middleware wins for response headers. The effective CORS behavior depends on which call sets headers first.

**Configured `CORS_ORIGIN`** (from current `.env`):

```
CORS_ORIGIN="http://localhost:5173,http://localhost:3000"
```

This means the configured allowed origins are:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (Next.js or the backend itself)

**`credentials: true`** is set on the second cors() call.

### CORS Settings Summary

| Setting | Value |
|---|---|
| Allowed Origins | `http://localhost:5173`, `http://localhost:3000` |
| `credentials` | `true` |
| Allowed Methods | Not explicitly configured → defaults: `GET, HEAD, PUT, PATCH, POST, DELETE` |
| Allowed Headers | Not explicitly configured → defaults to request's `Access-Control-Request-Headers` |
| Exposed Headers | None explicitly configured |
| Preflight caching | Not configured |

### Known Issue

See [Section 16](#16-known-integration-issues) — double `cors()` call.

---

## 14. Network / API Client Expectations

### Base URL

```
http://localhost:3000/api/v1
```

Must come from an environment variable. Never hardcode.

### Required Headers for Protected Requests

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Requests Without a Body

For GET and DELETE requests, omit `Content-Type`.

### Credentials

The CORS middleware has `credentials: true`, but the API does not use cookies. The `Authorization` header carries the access token. The frontend does NOT need to set `credentials: 'include'` in fetch calls unless cookies are added in the future.

### Token Management

```
Access token:
- Lifetime: 15 minutes (configurable via JWT_ACCESS_EXPIRES_IN).
- Store in memory (React state / Zustand / Redux). NOT in localStorage or sessionStorage (XSS risk).
- Attach to every protected request as: Authorization: Bearer <accessToken>

Refresh token:
- Lifetime: 30 days (configurable via JWT_REFRESH_EXPIRES_IN).
- Returned in the response body of login and refresh calls.
- SINGLE-USE — each call to /auth/refresh invalidates the old token.
- Store securely. Options: httpOnly cookie (requires backend change — currently not set by backend), or in-memory if the UX supports it.
- If a revoked refresh token is used, the entire token family is invalidated and the user must re-login.

Refresh flow:
1. API call returns 401.
2. Frontend calls POST /api/v1/auth/refresh with the stored refreshToken.
3. If refresh succeeds: update stored tokens, retry original request.
4. If refresh fails (401): clear all tokens, redirect to login.
```

### Error Handling

```
All errors → parse response.json().
Check response.status:
  401 → token expired/invalid → attempt refresh, or redirect to login.
  403 → show permission error.
  404 → show not found UI.
  409 → show conflict message to user.
  400 → display per-field validation errors from response.errors array.
  429 → show rate limit message; do not immediately retry.
  500 → show generic server error.
```

---

## 15. Frontend Implementation Requirements

The frontend agent **MUST**:

1. **Use the API base URL from an environment variable.** Never hardcode `localhost:3000` inside components or service files.

2. **Never put backend secrets in the frontend.** `DATABASE_URL`, `JWT_SECRET`, and any other backend-only config must never appear in frontend code.

3. **Implement a centralized API client/service layer.** All HTTP calls must go through a single service layer (e.g., `apiClient.js`, `api.ts`). Do not scatter `fetch()` or `axios()` calls throughout components.

4. **Send the JWT access token in the `Authorization` header.** Format: `Authorization: Bearer <accessToken>`. This is the ONLY authentication mechanism.

5. **Do NOT implement Firebase authentication.** Firebase is not used anywhere in the backend. Implementing Firebase would be incompatible with the backend.

6. **Implement token refresh logic.** When a 401 is received, attempt to refresh using `POST /auth/refresh`. If refresh fails, clear tokens and redirect to login.

7. **Store the access token in memory, not localStorage.** Store the refresh token securely (in-memory or httpOnly cookie if the backend is updated to support it).

8. **Use exact field names from this contract.** The backend uses camelCase for most fields (`fullName`, `isActive`, `createdAt`, `updatedAt`). Exceptions: specialty objects use `created_at` (snake_case).

9. **Use exact enum values.** `PATIENT`, `DOCTOR`, `ADMIN`, `PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `AVAILABLE`, `BOOKED`.

10. **Handle all documented status codes.** Implement specific UI behavior for 400, 401, 403, 404, 409, 429, 500.

11. **Display validation errors field-by-field.** Parse the `errors` array from 400 responses and display messages next to the relevant form fields.

12. **Treat date and time values as clinic-local, not UTC.** `date` (`YYYY-MM-DD`) and `startTime`/`endTime` (`HH:mm`) fields are `Africa/Cairo` local values. Display them without timezone conversion.

13. **Do not send `PENDING` as a status update.** Appointments start as `PENDING` automatically. The update endpoint only accepts `CONFIRMED`, `CANCELLED`, `COMPLETED`.

14. **Do not send `patientId`, `doctorId`, or `status` in the POST /appointments body.** These are ignored by the backend.

15. **Do not bypass CORS using proxy hacks or disabling browser security.** Configure the backend `CORS_ORIGIN` instead.

16. **After registration, redirect to login.** Registration does not return tokens. The user must explicitly log in after registering.

17. **Do not invent endpoints.** If functionality appears to be missing from the backend, report it as a missing capability rather than creating fake API calls.

18. **Handle DOCTOR vs PATIENT profile differences.** `GET /users/me` returns different shapes depending on role. Parse the `role` field and render accordingly.

---

## 16. Known Integration Issues

---

### Issue 1: Double CORS Middleware Registration

**Issue:** `cors()` is applied twice in `src/app.js` — once at line 26 and once at lines 31–34.

**Why it happens:** The first `cors()` call uses `{ origin: config.corsOrigin }` (a raw string like `"http://localhost:5173,http://localhost:3000"`), without `credentials: true`. The second call correctly parses the origins and adds `credentials: true`. Express processes middleware in registration order, so the first `cors()` call wins for setting response headers on the first pass.

**Backend location:** [`src/app.js`](src/app.js) lines 26–34.

**Expected frontend behavior:** If the frontend receives CORS errors, the backend CORS configuration must be fixed.

**Recommended fix:** Remove the first `cors()` call (line 26) so only the correctly configured one (lines 31–34) remains.

---

### Issue 2: Specialty Response Uses `created_at` (snake_case) Instead of `createdAt` (camelCase)

**Issue:** All other entities in the API return timestamps as `createdAt` and `updatedAt` (camelCase). Specialty objects returned from `GET /specialties`, `GET /specialties/:id`, `POST /specialties`, and `PATCH /specialties/:id` use `created_at` (snake_case) because the repository returns the Prisma model directly without transformation.

**Why it happens:** The specialties service does not apply a `toPublicSpecialty()` mapper function (unlike doctors, appointments, etc.). The raw Prisma result is returned directly.

**Backend location:** [`src/services/specialties.service.js`](src/services/specialties.service.js) — no mapper applied.

**Expected frontend behavior:** The frontend must handle `created_at` for specialty objects, not `createdAt`.

**Recommended fix:** Add a `toPublicSpecialty()` mapper in the specialties service to normalize the shape.

---

### Issue 3: `app.js` Has Duplicate `listen()` Calls

**Issue:** `src/app.js` has what appears to be three overlapping `listen()` calls inside the `if (import.meta.url === ...)` block (lines 68–77). This is likely a merge artifact.

**Why it happens:** Looks like copy-paste from multiple edit sessions left dead code.

**Backend location:** [`src/app.js`](src/app.js) lines 68–77.

**Expected frontend behavior:** This is a backend-only issue. The server likely still starts correctly since JavaScript ignores unreachable variable declarations. No frontend action required.

**Recommended fix:** Clean up `app.js` to have a single `app.listen()` call.

---

### Issue 4: No Refresh Token Cookie Support

**Issue:** The backend returns the `refreshToken` in the response **body**, not in an `httpOnly` cookie. This means the frontend must store the refresh token in JavaScript-accessible storage, which is vulnerable to XSS attacks.

**Why it happens:** The `cookie-parser` middleware is installed but no endpoint uses `res.cookie()`.

**Backend location:** `src/services/auth.service.js` — `issueTokens()` returns the token in the return value; `src/controllers/auth.controller.js` — included in `res.json()`.

**Expected frontend behavior:** Store the refresh token as securely as possible given this limitation. In-memory storage (if page refresh is not required) is the safest option. If persistence across page refresh is needed, `localStorage` is the only option without a backend change, with the associated XSS risk.

**Recommended fix (PROPOSED — NOT CURRENTLY IMPLEMENTED):** The backend could set the refresh token as an `httpOnly`, `SameSite=Strict` cookie and remove it from the response body. The frontend would then not need to manage the refresh token at all — the browser would send it automatically.

---

### Issue 5: No HTTPS / TLS

**Issue:** The backend listens on plain HTTP. There is no TLS configuration.

**Why it happens:** Local development setup only.

**Expected frontend behavior:** Use `http://` (not `https://`) for all API calls in local development.

**Recommended fix:** For production, deploy behind a reverse proxy (nginx, Caddy) that handles TLS termination.

---

### Issue 6: Rate Limiter Uses In-Memory Storage

**Issue:** Rate limiting uses `RateLimiterMemory` (in-process memory), not Redis or another distributed store.

**Why it happens:** Appropriate for single-instance development but limits do not persist across server restarts and do not work correctly in multi-instance production deployments.

**Expected frontend behavior:** Rate limits apply per IP per server process. Restarting the backend server resets all limits.

---

## 17. Missing Backend Capabilities

---

### Missing: Profile Image / Avatar Upload

**What the frontend may need:** Displaying doctor or patient profile photos.

**Current status:** No file upload endpoint exists. No image storage. No `multer` or similar library in `package.json`.

**PROPOSED — NOT CURRENTLY IMPLEMENTED:**
```
POST /api/v1/users/me/avatar
Content-Type: multipart/form-data
field: avatar
Auth: Bearer token, any role
Response: { "status": "success", "data": { "avatarUrl": "https://..." } }
```

---

### Missing: Email Verification

**What the frontend may need:** Verifying that a registered email is valid.

**Current status:** No email verification flow. Registration immediately creates an active account.

---

### Missing: Password Reset / Forgot Password

**What the frontend may need:** Allowing users to reset forgotten passwords.

**Current status:** No password reset endpoint. No email sending capability.

---

### Missing: Change Password

**What the frontend may need:** Allowing authenticated users to change their own password.

**Current status:** No change-password endpoint for authenticated users.

---

### Missing: Admin User Creation via API

**What the frontend may need:** An admin panel that creates other admin accounts.

**Current status:** Admin accounts can only be created via `npm run create-admin` (a local command-line script). There is no API endpoint for admin creation.

---

### Missing: Doctor Registration Approval Flow

**What the frontend may need:** An admin approval step before a DOCTOR can accept appointments.

**Current status:** DOCTOR accounts are immediately active upon registration. No approval workflow.

---

### Missing: Patient Appointment History (Past Appointments)

**What the frontend may need:** A dedicated "past appointments" view.

**Current status:** The existing `GET /appointments/me?status=COMPLETED` and `GET /appointments/me?status=CANCELLED` filters can partially serve this need. There is no dedicated endpoint for "past appointments" based on slot date.

---

## 18. Integration Examples

### A. Register a Patient

```http
POST http://localhost:3000/api/v1/auth/register
Content-Type: application/json

{
  "email": "patient@example.com",
  "password": "SecurePass123",
  "fullName": "Jane Doe",
  "phone": "+201000000000",
  "role": "PATIENT"
}
```

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": "a1b2c3d4-...",
    "role": "PATIENT"
  }
}
```

---

### B. Login

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "patient@example.com",
  "password": "SecurePass123"
}
```

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMWIyYzNkNCI...",
    "refreshToken": "a1b2c3d4e5f6a1b2c3d4e5f6...(96 chars)",
    "user": {
      "id": "a1b2c3d4-...",
      "role": "PATIENT"
    }
  }
}
```

---

### C. Authenticated Request — Get Current User

```http
GET http://localhost:3000/api/v1/users/me
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhMWIyYzNkNCI...
```

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "id": "a1b2c3d4-...",
    "email": "patient@example.com",
    "fullName": "Jane Doe",
    "phone": "+201000000000",
    "role": "PATIENT",
    "isActive": true,
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z",
    "patient": {
      "id": "p1q2r3s4-...",
      "dateOfBirth": "1995-06-15"
    }
  }
}
```

---

### D. List Available Doctors

```http
GET http://localhost:3000/api/v1/doctors?page=1&limit=10&specialty=Cardiology
```

**Response `200`:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "d1e2f3g4-...",
      "fullName": "Dr. John Smith",
      "specialty": { "id": "s1s2s3s4-...", "name": "Cardiology" },
      "bio": "Experienced cardiologist"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

---

### E. Get Doctor Availability

```http
GET http://localhost:3000/api/v1/doctors/d1e2f3g4-.../availability?from=2026-09-01&to=2026-09-30
```

**Response `200`:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "av1av2av3-...",
      "date": "2026-09-15",
      "startTime": "09:30",
      "endTime": "11:00"
    }
  ]
}
```

---

### F. Book an Appointment

```http
POST http://localhost:3000/api/v1/appointments
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json

{
  "availabilityId": "av1av2av3-...",
  "notes": "First consultation"
}
```

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": "ap1ap2ap3-...",
    "status": "PENDING",
    "notes": "First consultation",
    "createdAt": "2026-09-01T12:00:00.000Z",
    "updatedAt": "2026-09-01T12:00:00.000Z",
    "patient": { "id": "p1q2r3s4-...", "fullName": "Jane Doe" },
    "doctor": {
      "id": "d1e2f3g4-...",
      "fullName": "Dr. John Smith",
      "specialty": { "id": "s1s2s3s4-...", "name": "Cardiology" }
    },
    "availability": {
      "id": "av1av2av3-...",
      "date": "2026-09-15",
      "startTime": "09:30",
      "endTime": "11:00"
    }
  }
}
```

---

### G. Token Refresh

```http
POST http://localhost:3000/api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4e5f6...(96 chars)"
}
```

**Response `200`:** Same shape as login — new `accessToken` + new `refreshToken`.

---

### H. Validation Error Response

```http
POST http://localhost:3000/api/v1/auth/register
Content-Type: application/json

{
  "email": "not-an-email",
  "password": "short"
}
```

**Response `400`:**
```json
{
  "status": "validation_error",
  "message": "Request validation failed",
  "errors": [
    { "field": "email", "message": "Must be valid email", "code": "invalid_string" },
    { "field": "password", "message": "Password must be at least 8 charachters", "code": "too_small" },
    { "field": "fullName", "message": "Required", "code": "invalid_type" },
    { "field": "role", "message": "Invalid enum value. Expected 'PATIENT' | 'DOCTOR', received undefined", "code": "invalid_enum_value" }
  ]
}
```

---

### I. Logout

```http
POST http://localhost:3000/api/v1/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4e5f6...(96 chars)"
}
```

**Response `204`:** Empty body.

---

## 19. Instructions For The Frontend AI Agent

Read this entire document before modifying any code. Then:

1. **Inspect the existing frontend architecture first** — understand what already exists before making changes.

2. **Do NOT blindly rewrite the frontend.** Identify what already works and only change what is needed to connect it to the documented backend.

3. **Do NOT change the backend contract.** This document reflects the actual backend implementation. If you believe there is a discrepancy, report it.

4. **This backend uses custom JWT authentication — NOT Firebase.** Do not implement, reference, or configure Firebase anywhere. There is no Firebase project associated with this backend.

5. **Create a centralized API client** if one does not already exist. All requests must go through it. It must:
   - Prepend the base URL from `VITE_API_BASE_URL` (or framework equivalent).
   - Attach `Authorization: Bearer <token>` to all protected requests.
   - Handle 401 responses by attempting a token refresh before redirecting to login.
   - Parse and surface error shapes as documented.

6. **Configure environment variables correctly.** The only frontend variable needed is the API base URL:
   ```
   VITE_API_BASE_URL=http://localhost:3000/api/v1
   ```
   Never hardcode URLs in components.

7. **Implement authentication exactly per Section 4.** Register → do not auto-login → redirect to login. Login → store tokens → attach access token to requests → refresh on 401.

8. **Map backend responses to frontend models exactly.** Use `camelCase` for all fields EXCEPT specialty timestamps which use `created_at`.

9. **Handle ALL documented error states:**
   - Loading state (request in flight)
   - Empty state (successful but no data)
   - Success state
   - Validation error state (400 — show per-field errors)
   - Authentication error state (401 — redirect to login)
   - Authorization error state (403 — show permission denied)
   - Not found state (404)
   - Conflict state (409 — show conflict message)
   - Rate limit state (429 — show retry message)
   - Server error state (500 — show generic error)

10. **Never expose backend secrets.** Do not put `JWT_SECRET`, `DATABASE_URL`, or any other backend-only variable in the frontend `.env` file.

11. **Do not duplicate backend business logic.** Do not re-implement the appointment state machine, role authorization checks, or validation rules in frontend JavaScript. Send requests to the backend and handle the responses.

12. **For appointment status updates:**
    - A PATIENT can only send `{ "status": "CANCELLED" }`. Show CANCEL button only.
    - A DOCTOR can send `{ "status": "CONFIRMED" }`, `{ "status": "COMPLETED" }`, or `{ "status": "CANCELLED" }` depending on the current status.
    - The allowed values are `CONFIRMED`, `CANCELLED`, `COMPLETED` — never `PENDING`.

13. **For date/time display:**
    - `date` (`YYYY-MM-DD`) and `startTime`/`endTime` (`HH:mm`) are `Africa/Cairo` local clinic times. Display them as-is.
    - `createdAt` and `updatedAt` are UTC ISO timestamps. Convert to local time for display using standard date libraries.

14. **If the frontend expects functionality missing from the backend**, document it clearly and do NOT invent a fake API. Refer to Section 17 for already-identified missing capabilities.

15. **Test the complete frontend → backend flow locally** before marking the integration complete:
    - Register as PATIENT and as DOCTOR
    - Login with both
    - Get current user profile (`/users/me`)
    - List doctors and specialties
    - View doctor availability
    - Book an appointment (as PATIENT)
    - List own appointments (as both PATIENT and DOCTOR)
    - Update appointment status (DOCTOR confirms; PATIENT cancels)
    - Token refresh flow
    - Logout

---

*Contract generated: 2026-09-23. Source of truth: backend source code at commit HEAD of `omarmoashraf/Clinic-Booking-System-API`.*

