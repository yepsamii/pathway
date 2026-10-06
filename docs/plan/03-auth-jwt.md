# Phase 03 — Auth & JWT (User Module)

**Goal:** Registration, password hashing, login, JWT access + refresh token rotation, role-based guards. Users can sign up, sign in, and hit a protected endpoint that returns their own profile.

**Problem doc sections:** §19, §20

---

## Requirements

### Endpoints (all on port 3000 — single API)

```
POST   /auth/register      → 201, returns user + access + refresh
POST   /auth/login         → 200, returns user + access + refresh
POST   /auth/refresh       → 200, returns NEW access + NEW refresh, old refresh revoked
POST   /auth/logout        → 204, revokes the presented refresh token
GET    /users/me           → 200, current user from token (protected)
GET    /users/:id          → 200, public-safe user fields (any authenticated user)
```

### Middleware (applied at root, in `main.ts` or `app.module.ts`)
- Request-ID middleware (every request gets `req_<uuid>`, response `X-Request-Id`)
- Structured JSON logging (pino)
- Global error filter producing `{ error: { code, message }, request_id }`
- Rate limiting (full throttler in phase 07; stub for now)
- Global ValidationPipe (whitelist + transform)

### Registration
- Email validated (format)
- Phone validated (simple regex, e.g., `^\+?\d{8,15}$`)
- Password: minimum 8 chars, at least one letter and one digit
- Password hashed with **argon2**
- Duplicate email/phone → 409 `EMAIL_TAKEN` / `PHONE_TAKEN`
- Default role = USER
- No way to self-register as ADMIN/MERCHANT (admin via seed; merchant via admin endpoint — added in phase 09 if needed)

### Login
- Accept email OR phone + password
- Wrong credentials → 401 `INVALID_CREDENTIALS` (no distinction between user-not-found and wrong-password)
- Issue access token (15 min) + refresh token (7 days)

### JWT contents
Access token payload:
```json
{ "sub": "<user_id>", "role": "USER", "iat": ..., "exp": ..., "jti": "<uuid>" }
```
Signed HS256 with `JWT_ACCESS_SECRET`. Refresh token is opaque 32-byte random string (NOT a JWT); SHA-256 stored in `refresh_tokens.token_hash`.

### Refresh rotation
- Refresh endpoint reads raw token, looks up by hash
- If not found / revoked / expired → 401 `INVALID_REFRESH`
- If found: **revoke old row, insert new** in one transaction
- Same token presented again later → 401 `TOKEN_REUSE_DETECTED` (and revoke entire family)

### Authorization (RBAC)
- Roles: `USER`, `MERCHANT`, `ADMIN`
- `@Roles(...)` decorator + `RolesGuard`
- `JwtAuthGuard` (just authenticated) and `RolesGuard` (authenticated + has role)

### Status codes (conventions used app-wide)
- 200 OK
- 201 Created
- 204 No Content
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 422 Unprocessable Entity (business rule)
- 429 Too Many Requests
- 500 Internal Server Error (only for unexpected)
- 503 Service Unavailable

### Error envelope
```json
{ "error": { "code": "EMAIL_TAKEN", "message": "..." }, "request_id": "req_..." }
```
No stack traces. Implementation in `src/common/`.

---

## Structure & Tools

### Module: `src/modules/user/`
- `user.module.ts` (imports `AuthModule`)
- `auth/auth.controller.ts`, `auth/auth.service.ts`
- `user/user.controller.ts`, `user.service.ts`, `user.repository.ts`
- DTOs: `register.dto.ts`, `login.dto.ts`, `refresh.dto.ts`
- Uses `@app/auth` lib for guards/decorators

### Folder: `src/auth/` (shared lib, not a module)
- `jwt.strategy.ts` (passport-jwt)
- `jwt-auth.guard.ts`
- `roles.guard.ts`
- `roles.decorator.ts`
- `current-user.decorator.ts`
- Constants: `JWT_ACCESS_SECRET`, etc.

### Folder: `src/common/`
- `error-codes.ts` (enum)
- `global-exception.filter.ts`
- `validation.pipe.ts` (or configure globally)
- `request-id.middleware.ts`

### Tools
- `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`
- `argon2` for password hashing
- `class-validator`, `class-transformer`
- `uuid` for IDs

### Database access rule
- Only `src/modules/user/**` may read/write `users.*` tables
- Other modules trust JWT claims (or call `UserService.findPublicById` for display name — that's allowed)
- Document the rule in a top-of-file comment or in `docs/ARCHITECTURE.md`

---

## Acceptance Criteria

- [ ] `POST /auth/register` with valid body → 201 + user + tokens
- [ ] Duplicate email → 409 `EMAIL_TAKEN`
- [ ] Weak password → 422 `WEAK_PASSWORD`
- [ ] `POST /auth/login` with correct creds → 200 + tokens
- [ ] Wrong password → 401 `INVALID_CREDENTIALS`
- [ ] `POST /auth/refresh` with valid refresh → 200 + NEW tokens, old row revoked in DB
- [ ] Reused refresh → 401 `INVALID_REFRESH`
- [ ] `POST /auth/logout` → 204, row revoked
- [ ] `GET /users/me` without token → 401
- [ ] `GET /users/me` with valid token → 200
- [ ] Access token rejected after expiry
- [ ] Password stored as hash, never plain
- [ ] Refresh token stored as hash, never raw
- [ ] All errors use standard envelope; no stack traces

---

## Tests
- Unit: password hashing, refresh rotation, role guard
- Integration: register → login → refresh via supertest
- Integration: refresh reuse detection

---

## Self-test

> An attacker steals a user's refresh token and uses it. The legitimate user later logs in again, gets a new refresh token, and the attacker now tries to use the stolen one. Walk through what happens table by table, including which queries run in which order, and why the attacker is detected.

Hint: after the user rotates, the old row has `revoked_at` set. The attacker presents the stolen token → lookup finds the revoked row → reject AND revoke the entire family (cascade-revoke all rows with same `user_id` chain). Without this, an attacker with a stolen refresh token can stay logged in forever even after the user changes their password.