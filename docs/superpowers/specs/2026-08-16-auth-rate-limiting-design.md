# Auth rate limiting / hardening — Design

Date: 2026-08-16  
Status: approved for planning

## Goal

Protect public `POST /auth/login` and `POST /auth/register` on the demo deployment with per-IP rate limits, and harden auth responses against easy timing / wording-based email enumeration. No Redis, CAPTCHA, email verification, SSO, or 2FA in this cycle.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Rate limit + auth hardening on login/register only |
| Storage | In-memory now; Redis later if multiple replicas |
| Library | `@nestjs/throttler` (new dependency) |
| Register duplicate email | Keep `409`, neutral message + dummy `bcrypt.hash` |
| Login unknown email | Keep unified `401` message + dummy `bcrypt.compare` |
| Other API routes | Not throttled by the auth limits (skip global strict default) |

## Architecture

```
Client → POST /auth/login|register
         → ThrottlerGuard (per-IP, route-specific limits)
         → AuthService (dummy bcrypt on fail paths → JWT or error)
```

- Register `ThrottlerModule` in `AppModule` with a lenient or skipped default.
- Apply explicit `@Throttle(...)` on `login` and `register` only.
- Use `@SkipThrottle()` globally (or equivalent) so the rest of the API is unaffected.
- Track by IP. If the app sits behind a reverse proxy (e.g. Render), enable Express `trust proxy` so `req.ip` is the client IP.

## Limits (configurable via env)

Defaults:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 | 60s |
| `POST /auth/register` | 3 | 60s |

Env knobs (names may be adjusted in implementation, but intent is fixed):

- `AUTH_THROTTLE_TTL` — window in milliseconds (default `60000`)
- `AUTH_THROTTLE_LIMIT_LOGIN` — default `5`
- `AUTH_THROTTLE_LIMIT_REGISTER` — default `3`

Exceeding the limit → HTTP `429 Too Many Requests`. Prefer including `Retry-After` when the throttler provides it.

## Hardening details

### Login

- Existing unified message: `Invalid email or password` (unchanged).
- If no user for email: run `bcrypt.compare(password, DUMMY_HASH)` before throwing `401`, so timing is closer to the wrong-password path.

### Register

- If email already exists: run `bcrypt.hash(password, 10)` (discard result), then throw `ConflictException` with neutral text, e.g. `Unable to register with the provided email` (do not say “already registered”).
- Successful registration unchanged: create user + owned tree, return JWT + user.

### Dummy hash

- Use a single module-level bcrypt hash of a constant string (cost 10), computed once at module load or lazily on first use, shared by login miss path.

## Out of scope

- Redis / distributed rate limit storage
- CAPTCHA, email verification, password reset
- Throttling `/invites`, `/trees`, `/family-tree`, or global API quotas
- Changing successful register/login response shapes
- Frontend-only UX for 429 beyond whatever existing error handling already shows

## Testing

- Unit (`AuthService`): unknown-email login calls `bcrypt.compare`; duplicate-email register calls `bcrypt.hash` and throws `ConflictException` with the new message.
- Throttle: assert `429` after exceeding login/register limits; assert a non-auth route is not bound to those same limits.
- Existing auth tests updated for message / bcrypt mock expectations.

## Documentation

- Update `docs/dev/auth.md` (limits, 429, neutral 409).
- Brief note in `docs/dev/architecture.md` if public auth surface is listed.
- Check off the Now item in `docs/ROADMAP.md`.

## Success criteria

1. Burst of login/register from one IP returns `429` after the configured limit.
2. Duplicate register no longer returns “Email already registered”.
3. Login miss path exercises bcrypt compare (verified in unit tests).
4. Docs + ROADMAP updated in the same change set.
5. `npm run lint`, `npm test`, and `npm run build` pass.
