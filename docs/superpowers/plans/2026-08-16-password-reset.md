# Password reset / recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship forgot-password → one-time link → set new password, with log mail driver, anti-enumeration, rate limits, and JWT invalidation via `passwordChangedAt` + claim `pwd`.

**Architecture:** Neo4j `PasswordReset` nodes (SHA-256 token hash, like invites). `MailSender` port with `LogMailSender` default. `PasswordResetService` owns forgot/reset; `AuthService` issues JWT `pwd` and validates it in `JwtStrategy`. Web guest pages `/forgot-password` and `/reset-password`. No new npm dependencies.

**Tech Stack:** NestJS 11, Neo4j, existing `@nestjs/throttler`, bcrypt, Vite React web.

**Spec:** `docs/superpowers/specs/2026-08-16-password-reset-design.md`

## Global Constraints

- Delivery: `MailSender` + `MAIL_DRIVER=log` only (no SMTP package)
- Token: Neo4j `PasswordReset` + SHA-256 `tokenHash`; raw token never stored
- Forgot: always same HTTP 200 success message whether email exists
- Reset: update hash + `passwordChangedAt`; delete user reset nodes; no auto-login JWT
- JWT: claim `pwd` (unix ms); strategy rejects if user `passwordChangedAt` is set and (`pwd` missing or `pwd < passwordChangedAtMs`)
- Users without `passwordChangedAt`: accept existing tokens until first reset
- Throttle forgot ~3/60s, reset ~5/60s per IP (env-overridable)
- Out of scope: SMTP, in-account change password, email verify, 2FA, auto-login after reset
- No new npm dependencies
- Docs: `docs/dev/auth.md`, `docs/user/overview.md`, `docs/ROADMAP.md`, `.env.example`
- Verify: `npm test`, `npm run lint`, `npm run build`, `web` lint/build
- Ask before any new dependencies
- Keep files focused (`AuthService` already large — put reset flow in `PasswordResetService`)

## File map

| File | Responsibility |
|------|----------------|
| `src/modules/auth/interfaces/mail-sender.interface.ts` | `MailSender` port |
| `src/modules/auth/mail/log-mail.sender.ts` | Log driver |
| `src/modules/auth/mail/mail.constants.ts` | DI token |
| `src/config/mail.config.ts` / password-reset config | `MAIL_DRIVER`, `APP_PUBLIC_URL`, TTL |
| `src/config/auth-throttle.config.ts` | Add forgot/reset limits |
| `src/app.module.ts` | Extra throttler names; load mail/reset config |
| `src/modules/auth/services/password-reset.service.ts` | forgot / reset Neo4j + mail |
| `src/modules/auth/dto/forgot-password.dto.ts` | email |
| `src/modules/auth/dto/reset-password.dto.ts` | token + password |
| `src/modules/auth/auth.service.ts` | `pwd` on sign; `assertJwtPasswordFresh` |
| `src/modules/auth/interfaces/auth.interface.ts` | `JwtPayload.pwd?` |
| `src/modules/auth/strategies/jwt.strategy.ts` | call assert |
| `src/modules/auth/auth.controller.ts` | endpoints + throttle |
| `src/modules/auth/auth.module.ts` | providers |
| `src/modules/auth/*.spec.ts` | unit tests |
| `web/src/api.ts` | client helpers |
| `web/src/pages/ForgotPasswordPage.tsx` (+ css if needed) | form |
| `web/src/pages/ResetPasswordPage.tsx` | form |
| `web/src/pages/LoginPage.tsx` | link |
| `web/src/App.tsx` | routes |
| docs + `.env.example` | document + ROADMAP |

---

### Task 1: Mail port, config, PasswordResetService, JWT `pwd`

**Files:**
- Create: mail interface, log sender, constants, `password-reset.service.ts`, DTOs, mail/reset config
- Modify: `auth.interface.ts`, `auth.service.ts`, `jwt.strategy.ts`, `auth.module.ts`, `configuration.ts`, `auth-throttle.config.ts`, `app.module.ts`
- Test: `password-reset.service.spec.ts`, extend `auth.service.spec.ts` / jwt tests

**Interfaces:**
- Produces:
  - `MailSender.sendPasswordReset({ to, resetUrl }): Promise<void>`
  - `PASSWORD_RESET_TTL_MS` default `3600000`
  - `PasswordResetService.forgotPassword(email): Promise<{ message: string }>`
  - `PasswordResetService.resetPassword(token, password): Promise<{ message: string }>`
  - `JwtPayload.pwd?: number`
  - `AuthService.assertJwtPasswordFresh(userId, pwdClaim): Promise<void>`
  - Success forgot message exactly: `If an account exists for this email, a reset link has been sent.`
  - Success reset message exactly: `Password updated. You can sign in.`

- [ ] **Step 1: Write failing tests for PasswordResetService + JWT fresh check**

Create `src/modules/auth/services/password-reset.service.spec.ts` covering:

1. `forgotPassword` when user missing → same message; **no** write of PasswordReset; mail **not** called.
2. `forgotPassword` when user exists → neo4j write called; mail called with `to` and URL containing `/reset-password?token=`.
3. `resetPassword` valid → write updates passwordHash path invoked; deletes resets.
4. `resetPassword` unknown token → throws BadRequest.

Also in `auth.service.spec.ts` (or jwt strategy spec):

5. `assertJwtPasswordFresh`: user with `passwordChangedAt` and claim older → Unauthorized.
6. `assertJwtPasswordFresh`: user without `passwordChangedAt` → ok even if claim missing.
7. `signToken` / login includes `pwd` when user has `passwordChangedAt` (mock as needed).

Use the same Neo4j/jwt mock style as existing auth specs.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/tuocs/Projects/own/family-tree
npx jest src/modules/auth/services/password-reset.service.spec.ts src/modules/auth/auth.service.spec.ts -t "forgot|reset|passwordChanged|pwd|JwtPassword"
```

Expected: FAIL (missing service / methods).

- [ ] **Step 3: Add config + mail port**

`src/modules/auth/interfaces/mail-sender.interface.ts`:

```typescript
export interface SendPasswordResetInput {
  to: string;
  resetUrl: string;
}

export interface MailSender {
  sendPasswordReset(input: SendPasswordResetInput): Promise<void>;
}
```

`src/modules/auth/mail/mail.constants.ts`:

```typescript
export const MAIL_SENDER = Symbol("MAIL_SENDER");
```

`src/modules/auth/mail/log-mail.sender.ts`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import {
  MailSender,
  SendPasswordResetInput,
} from "../interfaces/mail-sender.interface";

@Injectable()
export class LogMailSender implements MailSender {
  private readonly logger = new Logger(LogMailSender.name);

  async sendPasswordReset(input: SendPasswordResetInput): Promise<void> {
    this.logger.log(
      `Password reset for ${input.to}: ${input.resetUrl}`,
    );
  }
}
```

`src/config/mail.config.ts`:

```typescript
import { registerAs } from "@nestjs/config";

export interface MailConfig {
  driver: "log";
  appPublicUrl: string;
  passwordResetTtlMs: number;
}

export const mailConfig = registerAs(
  "mail",
  (): MailConfig => ({
    driver: "log",
    appPublicUrl:
      process.env.APP_PUBLIC_URL || "http://localhost:5173",
    passwordResetTtlMs: parseInt(
      process.env.PASSWORD_RESET_TTL_MS || "3600000",
      10,
    ),
  }),
);
```

(Only `log` driver this cycle; ignore other `MAIL_DRIVER` values or treat unknown as log.)

Export from `configuration.ts`. Load in `AppModule` ConfigModule.

Extend `AuthThrottleConfig`:

```typescript
export interface AuthThrottleConfig {
  ttlMs: number;
  loginLimit: number;
  registerLimit: number;
  forgotLimit: number;
  resetLimit: number;
}
```

Defaults: `forgotLimit: 3`, `resetLimit: 5`. Env: `AUTH_THROTTLE_LIMIT_FORGOT`, `AUTH_THROTTLE_LIMIT_RESET`.

In `app.module.ts` ThrottlerModule factory, add named throttlers `forgot` and `register`-style:

```typescript
{ name: "forgot", ttl: throttle.ttlMs, limit: throttle.forgotLimit },
{ name: "reset", ttl: throttle.ttlMs, limit: throttle.resetLimit },
```

Update existing login/register `@SkipThrottle` objects to also skip `forgot` and `reset` (and vice versa on new routes in Task 2).

- [ ] **Step 4: Implement `PasswordResetService`**

Create `src/modules/auth/services/password-reset.service.ts`:

- Inject `Neo4jService`, `MAIL_SENDER`, `ConfigService`.
- `hashToken` via `createHash("sha256")` like invites.
- Raw token: `randomBytes(32).toString("base64url")`.
- `forgotPassword(email)`:
  - const message = `If an account exists for this email, a reset link has been sent.`;
  - find user by email (Cypher `MATCH (u:User {email: $email}) RETURN u`);
  - if none: optional `padLoginTiming` or short dummy; return `{ message }`;
  - else: create PasswordReset linked `FOR_USER`, expiresAt ISO from TTL; `mail.sendPasswordReset({ to, resetUrl: `${appPublicUrl}/reset-password?token=${raw}` })`; return `{ message }`.
- `resetPassword(token, password)`:
  - find reset where hash matches and `expiresAt > datetime()`;
  - if missing: `BadRequestException("Invalid or expired reset token")`;
  - bcrypt hash password; set user `passwordHash` + `passwordChangedAt: datetime()`; `DETACH DELETE` all PasswordReset for user;
  - return `{ message: "Password updated. You can sign in." }`.

Keep methods < 30 lines by extracting private helpers.

- [ ] **Step 5: JWT `pwd` + assert**

In `auth.interface.ts`:

```typescript
export interface JwtPayload {
  sub: string;
  email: string;
  treeId: string;
  role: TreeRole;
  pwd?: number;
}
```

In `AuthService.signToken`, load or accept `passwordChangedAtMs` — simplest: when building AuthUser sessions, also fetch `passwordChangedAt` from user node (or pass through). Practical approach:

- Add private `getPasswordChangedAtMs(userId: string): Promise<number | null>` reading user property (Neo4j datetime → ms).
- `signToken`: `pwd: (await getPasswordChangedAtMs(user.userId)) ?? 0` — using `0` for null keeps claim present; **assert** must treat user-null as “not set” so old behavior holds. Prefer: only add `pwd` when not null:

```typescript
const changedMs = await this.getPasswordChangedAtMs(user.userId);
const payload: JwtPayload = { sub, email, treeId, role };
if (changedMs != null) payload.pwd = changedMs;
```

`assertJwtPasswordFresh(userId, pwdClaim: number | undefined)`:

```typescript
const changedMs = await this.getPasswordChangedAtMs(userId);
if (changedMs == null) return;
if (pwdClaim == null || pwdClaim < changedMs) {
  throw new UnauthorizedException("Invalid token");
}
```

`JwtStrategy.validate`:

```typescript
await this.authService.assertJwtPasswordFresh(payload.sub, payload.pwd);
return this.authService.getProfile(payload.sub, payload.treeId);
```

Do **not** set `passwordChangedAt` on register (leave unset until first reset) so existing sessions stay valid after deploy.

- [ ] **Step 6: Wire AuthModule**

Provide `{ provide: MAIL_SENDER, useClass: LogMailSender }`, `PasswordResetService`. Export if needed.

- [ ] **Step 7: Run unit tests — PASS**

```bash
npx jest src/modules/auth --verbose
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/config src/app.module.ts src/modules/auth
git commit -m "$(cat <<'EOF'
feat(auth): add password reset service, log mail, and JWT pwd claim

EOF
)"
```

---

### Task 2: Controller endpoints + throttle + controller tests

**Files:**
- Modify: `auth.controller.ts`
- Create/modify: DTOs if not created in Task 1
- Modify: `auth.controller.spec.ts` (extend throttle tests)
- Update login/register SkipThrottle to skip new names

**Interfaces:**
- `POST /auth/forgot-password`, `POST /auth/reset-password`
- Throttlers: `@UseGuards(ThrottlerGuard)` + `@SkipThrottle` for the other named limits

- [ ] **Step 1: DTOs** (if missing)

`ForgotPasswordDto`: `@IsEmail() email`  
`ResetPasswordDto`: `@IsString() @MinLength(1) token`, password `@IsString() @MinLength(6) @MaxLength(72)` (match register)

- [ ] **Step 2: Controller methods**

```typescript
  @Post("forgot-password")
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ login: true, register: true, reset: true })
  @ApiOperation({ summary: "Request password reset email" })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordResetService.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ login: true, register: true, forgot: true })
  @ApiOperation({ summary: "Set new password with reset token" })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(dto.token, dto.password);
  }
```

Inject `PasswordResetService`. Update login/register SkipThrottle to include `forgot: true, reset: true`.

- [ ] **Step 3: Extend `auth.controller.spec.ts`**

Add ThrottlerModule named `forgot`/`reset` with limits 3/5; mock `PasswordResetService`; assert 429 after exceed; assert forgot limit does not block reset (mirror existing isolation test).

Also update existing SkipThrottle setup so old tests still pass (all four named throttlers in module).

- [ ] **Step 4: Run auth tests + lint**

```bash
npx jest src/modules/auth
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth src/app.module.ts src/config
git commit -m "$(cat <<'EOF'
feat(auth): expose forgot/reset password endpoints with rate limits

EOF
)"
```

---

### Task 3: Web UI

**Files:**
- Modify: `web/src/api.ts`, `LoginPage.tsx`, `App.tsx`
- Create: `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` (+ minimal css reuse login styles)

**Interfaces:**
- `forgotPassword(email)`, `resetPassword(token, password)` → API
- Routes `/forgot-password`, `/reset-password`

- [ ] **Step 1: API helpers**

In `web/src/api.ts`:

```typescript
export async function forgotPassword(email: string): Promise<{ message: string }> {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<{ message: string }> {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}
```

(Adjust to match existing `request` helper signature.)

- [ ] **Step 2: ForgotPasswordPage**

Guest page styled like login panel: email field, submit, show API `message` on success, link back to `/login`. Use `BrandLockup` / login-stage layout for consistency.

- [ ] **Step 3: ResetPasswordPage**

Read `token` from `useSearchParams()`. Fields: password, confirm; client-side match check; submit → success → navigate `/login`. Missing token → error state.

- [ ] **Step 4: Login link + routes**

Login (login mode): link «Забыли пароль?» → `/forgot-password`.

`App.tsx`:

```tsx
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />
```

- [ ] **Step 5: Web lint + build**

```bash
cd web && npm run lint && npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "$(cat <<'EOF'
feat(web): add forgot and reset password pages

EOF
)"
```

---

### Task 4: Documentation + ROADMAP + full verify

**Files:**
- Modify: `docs/dev/auth.md`, `docs/user/overview.md`, `docs/ROADMAP.md`, `.env.example`

- [ ] **Step 1: docs/dev/auth.md**

Document endpoints, messages, `PasswordReset` model, `pwd` claim, `MAIL_DRIVER=log`, `APP_PUBLIC_URL`, TTL, throttle env vars.

- [ ] **Step 2: docs/user/overview.md**

Add rows/pages for forgot/reset in the routes table.

- [ ] **Step 3: ROADMAP**

Check off **Сброс пароля / recovery**.

- [ ] **Step 4: .env.example**

```bash
APP_PUBLIC_URL=http://localhost:5173
MAIL_DRIVER=log
PASSWORD_RESET_TTL_MS=3600000
AUTH_THROTTLE_LIMIT_FORGOT=3
AUTH_THROTTLE_LIMIT_RESET=5
```

- [ ] **Step 5: Full verification**

```bash
cd /Users/tuocs/Projects/own/family-tree
npm test && npm run lint && npm run build
cd web && npm run lint && npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add docs .env.example
git commit -m "$(cat <<'EOF'
docs: document password reset and mark roadmap done

EOF
)"
```

---

## Plan self-review

| Spec item | Task |
|-----------|------|
| MailSender + log | 1 |
| PasswordReset Neo4j + hash | 1 |
| forgot/reset API + anti-enumeration | 1–2 |
| passwordChangedAt + JWT pwd | 1 |
| Throttle forgot/reset | 1–2 |
| Web pages + login link | 3 |
| Docs + ROADMAP + env | 4 |
| No new deps / no SMTP | all |
| AuthService size → PasswordResetService | 1 |

No TBD placeholders. Exact success message strings fixed for tests and UI.
