# Frontend Integration Guide & API Contract Handoff

Welcome to the **Clinic Booking System** API integration guide for the frontend team.

---

## 1. What Files to Send to the Frontend Team

The frontend team can consume any (or all) of the following contract files:

1. **Static OpenAPI Contract (JSON):**
   - [`docs/openapi.json`](docs/openapi.json) or [`docs/api-contract.json`](docs/api-contract.json)
   - Compatible with **Postman**, **Insomnia**, **Swagger Editor**, and code generation tools (**Orval**, **openapi-typescript**, **rtk-query-codegen**).
2. **Interactive Swagger UI (When Backend is Running):**
   - URL: `http://localhost:3000/api/docs`
   - Live JSON Spec: `http://localhost:3000/api/docs.json`
3. **Comprehensive Human-Readable Specification:**
   - [`docs/API.md`](docs/API.md) — complete route definitions, parameters, payloads, authorization matrix, state transitions, and business logic.

---

## 2. Environment Variables (.env): What Frontend Needs

### ❌ What Frontend Should NEVER Have in `.env`
- `DATABASE_URL` (Direct PostgreSQL credentials — critical security vulnerability if exposed to browser)
- `JWT_SECRET` (Backend private symmetric signing key — critical security vulnerability)

### ✅ What Frontend MUST Have in Their Own `.env`

Frontend applications only need the backend API Base URL.

#### If using Vite (React / Vue):
```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

#### If using Next.js:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
```

#### If using Create React App:
```env
REACT_APP_API_BASE_URL=http://localhost:3000/api/v1
```

---

## 3. Backend Configuration for Frontend Connection

In the backend `.env`:
- **`PORT=3000`**
- **`CORS_ORIGIN`**: By default set to `*` in development. If you want strict origin protection during local development or production, specify the frontend dev port:
  ```env
  CORS_ORIGIN=http://localhost:5173
  ```

---

## 4. Key Architectural Patterns for Frontend

### A. Authentication & Tokens
- **Access Token:** Short-lived JWT (15 minutes).
  - Sent in request headers:
    ```text
    Authorization: Bearer <accessToken>
    ```
  - Best practice: Keep in memory/state (e.g. Redux / Zustand / React Context) rather than `localStorage` to prevent XSS exfiltration.
- **Refresh Token:** Opaque string (30-day lifetime).
  - Returned in `POST /auth/login` and `POST /auth/refresh` response body.
  - Refresh tokens are **single-use with rotation**: Every call to `POST /auth/refresh` revokes the old token and returns a new access + refresh token pair.
  - If a rotated refresh token is sent again, the backend revokes the **entire session chain** for security.
- **Registration:**
  - `POST /auth/register` creates the user but **does not return tokens**. Frontend must redirect the user to log in (`POST /auth/login`).

### B. Standard Response Envelope
All successful responses are wrapped in a standard structure:

#### Non-paginated:
```json
{
  "status": "success",
  "data": { ... }
}
```

#### Paginated:
```json
{
  "status": "success",
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

### C. Standard Error Envelopes

#### 1. General Errors (401, 403, 404, 409):
```json
{
  "status": "error",
  "message": "Doctor not found"
}
```

#### 2. Validation Errors (400 Bad Request):
```json
{
  "status": "validation_error",
  "message": "Request validation failed",
  "errors": [
    {
      "field": "email",
      "message": "must be a valid email",
      "code": "invalid_string"
    }
  ]
}
```

#### 3. Rate Limit Exceeded (429 Too Many Requests):
```json
{
  "message": "Too many requests. Please try again later."
}
```
- Rate limits apply to Auth endpoints:
  - `POST /auth/login`: 10 requests / 15 min per IP.
  - `POST /auth/register`: 5 requests / 1 hr per IP.
  - `POST /auth/refresh`: 20 requests / 15 min per IP.

### D. Timezone Handling
- The clinic operates on a fixed wall-clock timezone: **`Africa/Cairo`**.
- Availability dates are `YYYY-MM-DD` strings.
- Availability times are `HH:mm` 24-hour strings (e.g. `"09:30"`, `"14:00"`).
- The frontend does not need to convert slots to UTC — display them directly as local clinic wall-clock times.

---

## 5. Quick TypeScript Types Generation

The frontend team can auto-generate TypeScript types from the contract file:

```bash
# Using openapi-typescript
npx openapi-typescript docs/openapi.json -o src/types/api.d.ts

# Or directly from the running dev backend
npx openapi-typescript http://localhost:3000/api/docs.json -o src/types/api.d.ts
```

