# Auth rate limiting / hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate-limit `POST /auth/login` and `POST /auth/register` per IP, and harden login/register fail paths against wording/timing email enumeration.

**Architecture:** Add `@nestjs/throttler` with named in-memory throttlers `login` and `register`. Apply `ThrottlerGuard` only on those two handlers (no global APP_GUARD). In `AuthService`, run dummy bcrypt on unknown-email login and duplicate-email register; use a neutral 409 message. Enable Express `trust proxy` so `req.ip` is correct behind Render.

**Tech Stack:** NestJS 11, `@nestjs/throttler` (new), bcrypt (existing), Jest + Supertest (existing).

**Spec:** `docs/superpowers/specs/2026-08-16-auth-rate-limiting-design.md`

## Global Constraints

- Scope: login/register only — no Redis, CAPTCHA, email verification, password reset, or throttling other API routes
- Storage: in-memory (default throttler storage)
- Limits: login **5**/60s, register **3**/60s (env-overridable)
- Duplicate register: keep **409**, message `Unable to register with the provided email` + dummy `bcrypt.hash`
- Login miss: unified `Invalid email or password` + dummy `bcrypt.compare`
- New dependency allowed: `@nestjs/throttler` only
- Docs-maintenance: `docs/dev/auth.md`, `docs/dev/architecture.md` (brief), `docs/ROADMAP.md`
- Verify with `npm run lint`, `npm test`, `npm run build`
- Ask before any further new dependencies

## File map

| File | Responsibility |
|------|----------------|
| `package.json` / `package-lock.json` | Add `@nestjs/throttler` |
| `src/config/auth-throttle.config.ts` | Env → ttl + login/register limits |
| `src/config/configuration.ts` | Re-export throttle config |
| `src/app.module.ts` | `ThrottlerModule.forRootAsync` with named `login` / `register` |
| `src/main.ts` | `trust proxy` for correct client IP |
| `src/modules/auth/auth.controller.ts` | `ThrottlerGuard` + skip the other named throttler on login/register |
| `src/modules/auth/auth.service.ts` | Dummy bcrypt paths + neutral 409 text |
| `src/modules/auth/auth-timing.utils.ts` | Shared dummy hash helper (keeps service small) |
| `src/modules/auth/auth.service.spec.ts` | Unit tests for hardening |
| `src/modules/auth/auth.controller.spec.ts` | Throttle 429 tests via TestingModule + supertest |
| `.env.example` | Document throttle env vars |
| `docs/dev/auth.md` | Limits, 429, 409 wording |
| `docs/dev/architecture.md` | One-line note on auth rate limits |
| `docs/ROADMAP.md` | Check off rate-limiting item |

---

### Task 1: AuthService hardening (dummy bcrypt + neutral 409)

**Files:**
- Create: `src/modules/auth/auth-timing.utils.ts`
- Modify: `src/modules/auth/auth.service.ts`
- Modify: `src/modules/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: existing `login` / `register`; mocked `bcrypt` in specs
- Produces:
  - `getDummyPasswordHash(): Promise<string>`
  - `padLoginTiming(password: string): Promise<void>`
  - `padRegisterTiming(password: string): Promise<void>`
  - Register conflict message: `Unable to register with the provided email`

- [ ] **Step 1: Write failing unit tests for hardening**

In `src/modules/auth/auth.service.spec.ts`, add imports:

```typescript
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
```

(Keep the existing `jest.mock("bcrypt", ...)` at top of file.)

Add tests inside `describe("AuthService", ...)`:

```typescript
  it("runs bcrypt.compare when login email is unknown", async () => {
    neo4j.read.mockResolvedValue({ records: [] });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: "missing@example.com", password: "secret123" }),
    ).rejects.toThrow(UnauthorizedException);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "secret123",
      expect.any(String),
    );
  });

  it("rejects duplicate register with neutral message after hashing", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({
          u: {
            id: "user-1",
            email: "ada@example.com",
            passwordHash: "hashed-password",
            name: "Ada",
          },
        }),
      ],
    });
    (bcrypt.hash as jest.Mock).mockClear();

    await expect(
      service.register({
        email: "ada@example.com",
        password: "secret123",
        name: "Ada",
      }),
    ).rejects.toMatchObject({
      message: "Unable to register with the provided email",
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("secret123", 10);
  });
```

Also assert unknown-email login still uses `Invalid email or password` (e.g. `rejects.toThrow(/Invalid email or password/)` on that path).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/tuocs/Projects/own/family-tree
npx jest src/modules/auth/auth.service.spec.ts -t "runs bcrypt.compare|neutral message"
```

Expected: FAIL (compare not called on unknown email; message still `Email already registered`).

- [ ] **Step 3: Add `auth-timing.utils.ts`**

Create `src/modules/auth/auth-timing.utils.ts`:

```typescript
const DUMMY_PASSWORD = "timing-pad-not-a-real-password";

let dummyHashPromise: Promise<string> | null = null;

export async function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = import("bcrypt").then((bcrypt) =>
      bcrypt.hash(DUMMY_PASSWORD, 10),
    );
  }
  return dummyHashPromise;
}

export async function padLoginTiming(password: string): Promise<void> {
  const bcrypt = await import("bcrypt");
  const dummyHash = await getDummyPasswordHash();
  await bcrypt.compare(password, dummyHash);
}

export async function padRegisterTiming(password: string): Promise<void> {
  const bcrypt = await import("bcrypt");
  await bcrypt.hash(password, 10);
}
```

- [ ] **Step 4: Wire hardening into `AuthService`**

In `auth.service.ts`:

1. Import `padLoginTiming`, `padRegisterTiming` from `./auth-timing.utils`.
2. In `register`, when `existing` is truthy:

```typescript
    if (existing) {
      await padRegisterTiming(dto.password);
      throw new ConflictException("Unable to register with the provided email");
    }
```

3. In `login`, when `!row`:

```typescript
    if (!row) {
      await padLoginTiming(dto.password);
      throw new UnauthorizedException("Invalid email or password");
    }
```

Leave the wrong-password path unchanged (real `bcrypt.compare` already runs).

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx jest src/modules/auth/auth.service.spec.ts
```

Expected: all AuthService / JwtStrategy tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/auth-timing.utils.ts src/modules/auth/auth.service.ts src/modules/auth/auth.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(auth): pad login/register timing and neutralize register conflict

EOF
)"
```

---

### Task 2: Throttle config + module wiring + controller guards

**Files:**
- Create: `src/config/auth-throttle.config.ts`
- Modify: `src/config/configuration.ts`
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`
- Modify: `src/modules/auth/auth.controller.ts`
- Modify: `.env.example`
- Create: `src/modules/auth/auth.controller.spec.ts`
- Modify: `package.json` / lockfile (install `@nestjs/throttler`)

**Interfaces:**
- Consumes: `ConfigService`; named throttlers `login` and `register`
- Produces:
  - `AuthThrottleConfig { ttlMs, loginLimit, registerLimit }` under config key `authThrottle`
  - `POST /auth/login` and `POST /auth/register` protected by `ThrottlerGuard`
  - HTTP `429` after exceeding limits

- [ ] **Step 1: Install dependency**

```bash
cd /Users/tuocs/Projects/own/family-tree
npm install @nestjs/throttler
```

Expected: `@nestjs/throttler` appears in `dependencies`; lockfile updates. Do not add other packages.

- [ ] **Step 2: Write failing throttle controller tests**

Create `src/modules/auth/auth.controller.spec.ts`:

```typescript
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

describe("AuthController throttling", () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn().mockResolvedValue({ accessToken: "t", user: {} }),
    register: jest.fn().mockResolvedValue({ accessToken: "t", user: {} }),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: "login", ttl: 60_000, limit: 5 },
          { name: "register", ttl: 60_000, limit: 3 },
        ]),
      ],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    authService.login.mockClear();
    authService.register.mockClear();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 429 after exceeding login limit", async () => {
    const body = { email: "ada@example.com", password: "secret123" };
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post("/auth/login").send(body).expect(201);
    }
    await request(app.getHttpServer()).post("/auth/login").send(body).expect(429);
  });

  it("returns 429 after exceeding register limit", async () => {
    const body = {
      email: "ada@example.com",
      password: "secret123",
      name: "Ada",
    };
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post("/auth/register")
        .send(body)
        .expect(201);
    }
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(body)
      .expect(429);
  });

  it("does not apply login limit to register", async () => {
    const loginBody = { email: "ada@example.com", password: "secret123" };
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send(loginBody)
        .expect(201);
    }
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: "new@example.com",
        password: "secret123",
        name: "New",
      })
      .expect(201);
  });
});
```

Notes for the implementer:
- Nest may return `200`/`201` depending on whether `@HttpCode` is set — AuthController currently has no `@HttpCode`; default POST is **201**. If tests get `200`, adjust expectations to the actual status.
- If ValidationPipe rejects register body, fix DTO fields to match `RegisterDto`.
- Import style: if `esModuleInterop` makes `import request from "supertest"` required, use that (check how other specs import, or try both). Prefer:

```typescript
import request from "supertest";
```

if `* as request` fails at runtime.

- [ ] **Step 3: Run throttle tests — expect FAIL**

```bash
npx jest src/modules/auth/auth.controller.spec.ts
```

Expected: FAIL (no throttling wired on controller yet — 6th login still 201, or guards missing).

- [ ] **Step 4: Add `auth-throttle.config.ts` and export it**

Create `src/config/auth-throttle.config.ts`:

```typescript
import { registerAs } from "@nestjs/config";

export interface AuthThrottleConfig {
  ttlMs: number;
  loginLimit: number;
  registerLimit: number;
}

export const authThrottleConfig = registerAs(
  "authThrottle",
  (): AuthThrottleConfig => ({
    ttlMs: parseInt(process.env.AUTH_THROTTLE_TTL || "60000", 10),
    loginLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT_LOGIN || "5", 10),
    registerLimit: parseInt(
      process.env.AUTH_THROTTLE_LIMIT_REGISTER || "3",
      10,
    ),
  }),
);
```

In `src/config/configuration.ts` add:

```typescript
export * from "./auth-throttle.config";
```

In `src/app.module.ts`, import `authThrottleConfig` from `./config/configuration` and add it to `ConfigModule.forRoot({ load: [...] })`.

- [ ] **Step 5: Register `ThrottlerModule.forRootAsync` in `AppModule`**

In `app.module.ts` imports array (after `ConfigModule`), add:

```typescript
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttle =
          config.get<AuthThrottleConfig>("authThrottle") ?? {
            ttlMs: 60_000,
            loginLimit: 5,
            registerLimit: 3,
          };
        return [
          {
            name: "login",
            ttl: throttle.ttlMs,
            limit: throttle.loginLimit,
          },
          {
            name: "register",
            ttl: throttle.ttlMs,
            limit: throttle.registerLimit,
          },
        ];
      },
    }),
```

Imports needed:

```typescript
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthThrottleConfig } from "./config/auth-throttle.config";
```

Do **not** register `APP_GUARD` for `ThrottlerGuard` — only the auth handlers will use the guard.

- [ ] **Step 6: Apply guards on `AuthController`**

Update `src/modules/auth/auth.controller.ts`:

```typescript
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthUser } from "./interfaces/auth.interface";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ login: true })
  @ApiOperation({ summary: "Register user and create a personal tree" })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ register: true })
  @ApiOperation({ summary: "Login" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user profile" })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
```

Remove unused `Throttle` import if not used. `@SkipThrottle()` on `me` is optional (no ThrottlerGuard there); keep or omit — prefer omit unused decorator on `me` to avoid noise:

Final `me` method: only `JwtAuthGuard` (no SkipThrottle).

- [ ] **Step 7: Enable trust proxy in `main.ts`**

Immediately after creating the app:

```typescript
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.set("trust proxy", 1);
```

- [ ] **Step 8: Document env vars in `.env.example`**

After the JWT block, add:

```bash
# Auth rate limits (per IP, in-memory; window AUTH_THROTTLE_TTL in ms)
AUTH_THROTTLE_TTL=60000
AUTH_THROTTLE_LIMIT_LOGIN=5
AUTH_THROTTLE_LIMIT_REGISTER=3
```

- [ ] **Step 9: Align controller spec with real wiring**

Ensure `auth.controller.spec.ts` mirrors production decorators: same `@UseGuards(ThrottlerGuard)` + `@SkipThrottle({ login: true })` / `{ register: true }` on the controller under test (decorators are on the class already once Step 6 is done — the TestingModule only needs `ThrottlerModule` + controller + mock service).

If Nest returns `200` instead of `201`, change `.expect(201)` → `.expect(200)`.

If the 6th login is not 429, verify `ThrottlerGuard` is applied (decorators present) and that both named throttlers are not both counting (SkipThrottle required).

- [ ] **Step 10: Run tests**

```bash
npx jest src/modules/auth/auth.controller.spec.ts src/modules/auth/auth.service.spec.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json \
  src/config/auth-throttle.config.ts src/config/configuration.ts \
  src/app.module.ts src/main.ts \
  src/modules/auth/auth.controller.ts src/modules/auth/auth.controller.spec.ts \
  .env.example
git commit -m "$(cat <<'EOF'
feat(auth): rate-limit login and register per IP

EOF
)"
```

---

### Task 3: Documentation + ROADMAP + verification

**Files:**
- Modify: `docs/dev/auth.md`
- Modify: `docs/dev/architecture.md`
- Modify: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: shipped behavior from Tasks 1–2
- Produces: docs match implementation; roadmap item checked

- [ ] **Step 1: Update `docs/dev/auth.md`**

After the auth endpoints table (or in a new subsection **Rate limiting**), add:

```markdown
## Rate limiting

`POST /auth/login` and `POST /auth/register` are rate-limited **per client IP** (in-memory; resets on process restart). Defaults:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 | 60s |
| `POST /auth/register` | 3 | 60s |

Env: `AUTH_THROTTLE_TTL` (ms), `AUTH_THROTTLE_LIMIT_LOGIN`, `AUTH_THROTTLE_LIMIT_REGISTER`.

Exceeding the limit → `429 Too Many Requests`. Other routes are not covered by these auth throttlers.

Behind a reverse proxy, the API uses Express `trust proxy` so the client IP is taken from the proxy headers.

## Auth hardening notes

- Login failures always use `Invalid email or password` (unknown email still runs a dummy bcrypt compare).
- Duplicate register → `409` with `Unable to register with the provided email` (dummy bcrypt hash first). Full email privacy needs verification/recovery later.
```

Also update the register row description if it still implies the old conflict text only.

- [ ] **Step 2: Update `docs/dev/architecture.md`**

In **Авторизация на API**, after the public endpoints bullet, add:

```markdown
- `POST /auth/login` и `POST /auth/register` ограничены по IP (см. [auth.md](auth.md)).
```

- [ ] **Step 3: Check off ROADMAP**

In `docs/ROADMAP.md`, change:

```markdown
- [ ] **Rate limiting / hardening auth** — защита login/register на публичном демо
```

to:

```markdown
- [x] **Rate limiting / hardening auth** — защита login/register на публичном демо
```

- [ ] **Step 4: Full verification**

```bash
cd /Users/tuocs/Projects/own/family-tree
npm test
npm run lint
npm run build
```

Expected: all PASS / exit code 0.

- [ ] **Step 5: Commit**

```bash
git add docs/dev/auth.md docs/dev/architecture.md docs/ROADMAP.md
git commit -m "$(cat <<'EOF'
docs: document auth rate limits and mark roadmap done

EOF
)"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| `@nestjs/throttler`, in-memory | Task 2 |
| Limits 5/3 per 60s + env | Task 2 (`auth-throttle.config`) |
| Only login/register (no global APP_GUARD) | Task 2 |
| 429 on exceed | Task 2 tests |
| trust proxy | Task 2 `main.ts` |
| Login dummy compare + same 401 text | Task 1 |
| Register dummy hash + neutral 409 | Task 1 |
| Docs + ROADMAP | Task 3 |
| lint / test / build | Task 3 |
| Out of scope (Redis, CAPTCHA, …) | Not planned |

No TBD placeholders. Named throttlers `login` / `register` are consistent across AppModule, controller SkipThrottle, and controller specs.
