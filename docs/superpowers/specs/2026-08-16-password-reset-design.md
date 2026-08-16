# Password reset / recovery — Design

Date: 2026-08-16  
Status: approved for planning

## Goal

Let users recover access via forgot-password → one-time link → new password, with anti-enumeration responses, rate limits, log-based mail delivery by default, and invalidation of JWTs issued before the password change. No SMTP provider and no in-account “change password” in this cycle.

## Decisions

| Topic | Choice |
|-------|--------|
| Delivery | `MailSender` port; default `MAIL_DRIVER=log` (console); SMTP later behind same interface |
| Token storage | Neo4j `PasswordReset` node + SHA-256 `tokenHash` (same pattern as invites) |
| Public responses | Forgot always returns the same success message whether or not the email exists |
| Session invalidation | `User.passwordChangedAt` + JWT claim `pwd`; strategy rejects stale tokens |
| In-account password change | Out of scope |
| New npm deps | None for mail (log driver only) |

## API

### `POST /auth/forgot-password` (public, throttled)

Body: `{ email: string }`

Behavior:

1. Normalize email (lowercase).
2. Always respond with the same shape/message, e.g. `{ message: "If an account exists for this email, a reset link has been sent." }` (HTTP 200).
3. If a user exists: create `PasswordReset`, build URL `{APP_PUBLIC_URL}/reset-password?token={rawToken}`, call `MailSender.sendPasswordReset`.
4. If no user: optional timing pad (dummy work) so existence is harder to infer; still same 200.

### `POST /auth/reset-password` (public, throttled)

Body: `{ token: string, password: string }` (password rules same as register: 6–72)

Behavior:

1. Lookup by `tokenHash`; require unexpired, unused.
2. Update `User.passwordHash`, set `passwordChangedAt = datetime()`.
3. Delete all `PasswordReset` nodes for that user (or at least this one).
4. Respond `{ message: "Password updated. You can sign in." }` (no auto-login JWT required; web sends user to `/login`).
5. Invalid/expired token → `400` with generic message (no email leak).

### Rate limits

Extend auth throttlers (or add named ones) for forgot/reset, e.g. forgot **3**/60s, reset **5**/60s per IP (env-overridable). Reuse existing `@nestjs/throttler` pattern from login/register.

## Data model (Neo4j)

```
(:PasswordReset {
  id: string,
  tokenHash: string,   // SHA-256 of raw token
  expiresAt: datetime,
  createdAt: datetime
})-[:FOR_USER]->(:User)

User += passwordChangedAt: datetime | null
```

- Raw token: cryptographically random (e.g. 32 bytes hex/base64url), never stored plaintext.
- TTL: `PASSWORD_RESET_TTL_MS` default `3600000` (1h).
- On successful reset: delete this user’s reset nodes.

Existing users without `passwordChangedAt`: treat as `null` / epoch 0 for comparison so current JWTs keep working until the first reset.

## JWT invalidation

- Extend `JwtPayload` with optional `pwd: number` (unix ms of `passwordChangedAt` at issue time).
- All token issuance paths set `pwd` from current user property (`login`, `register`, `issueSessionForTree` / switch, invite accept session).
- `JwtStrategy.validate` (or `AuthService` helper): load user’s `passwordChangedAt`; if it is set and (`payload.pwd` is missing or `payload.pwd < passwordChangedAtMs`) → `UnauthorizedException`.
- After reset, previously issued tokens fail on next authenticated request / `/auth/me`.

## Mail port

```ts
interface MailSender {
  sendPasswordReset(input: { to: string; resetUrl: string }): Promise<void>;
}
```

- `LogMailSender`: Nest `Logger` — log `to` + `resetUrl` (acceptable for private demo; do not log raw token elsewhere).
- Config: `MAIL_DRIVER=log` (default), `APP_PUBLIC_URL` (required for useful links; fallback `http://localhost:5173` in dev).
- Future: `SmtpMailSender` when `MAIL_DRIVER=smtp` — not implemented this cycle.

## Web UI

- Login: link «Забыли пароль?» → `/forgot-password`.
- `/forgot-password`: email form → success copy (same whether account exists).
- `/reset-password?token=`: new password (+ confirm) → success → navigate `/login`.
- Client API helpers for the two endpoints; handle `429` like other auth errors.
- Routes registered in the existing React router; guest-accessible (like `/login`).

## Out of scope

- SMTP / Resend / real ESP
- Change password while logged in
- Email verification on register
- 2FA, SSO
- Auto-login after reset
- Redis-backed throttle storage

## Testing

- Unit: forgot creates reset only when user exists; always same response message; reset updates hash + `passwordChangedAt` and rejects bad/expired token; JWT validate rejects `pwd` older than `passwordChangedAt`.
- Throttle: forgot/reset return `429` after limit (same TestingModule style as auth controller tests if practical).
- Web: no mandatory RTL; lint/build sufficient unless existing test patterns apply.

## Documentation

- Update `docs/dev/auth.md` (endpoints, JWT `pwd`, mail driver, env).
- Short user note in `docs/user/overview.md` (forgot/reset pages).
- Check off **Сброс пароля / recovery** in `docs/ROADMAP.md`.
- `.env.example`: `MAIL_DRIVER`, `APP_PUBLIC_URL`, reset TTL / throttle knobs.

## Success criteria

1. Forgot always returns the same 200 message; log contains reset URL when the user exists and `MAIL_DRIVER=log`.
2. Valid token sets new password; old password fails login; old JWTs fail `/auth/me`.
3. Invalid/expired token cannot reset; rate limits apply.
4. Docs + ROADMAP updated; `npm run lint`, `npm test`, `npm run build`, and `web` lint/build pass.
5. No new npm dependencies.
