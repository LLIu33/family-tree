import {
  INestApplication,
  Module,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordResetService } from "./services/password-reset.service";

// Repo has no @types/supertest; esModuleInterop default import is required at runtime.
// @ts-expect-error -- no declaration file for supertest
import request from "supertest";

describe("AuthController throttling", () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn().mockResolvedValue({ accessToken: "t", user: {} }),
    register: jest.fn().mockResolvedValue({ accessToken: "t", user: {} }),
  };
  const passwordResetService = {
    forgotPassword: jest
      .fn()
      .mockResolvedValue({
        message:
          "If an account exists for this email, a reset link has been sent.",
      }),
    resetPassword: jest
      .fn()
      .mockResolvedValue({ message: "Password updated. You can sign in." }),
  };

  @Module({
    imports: [
      ThrottlerModule.forRoot([
        { name: "login", ttl: 60_000, limit: 5 },
        { name: "register", ttl: 60_000, limit: 3 },
        { name: "forgot", ttl: 60_000, limit: 3 },
        { name: "reset", ttl: 60_000, limit: 5 },
      ]),
    ],
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: PasswordResetService, useValue: passwordResetService },
    ],
  })
  class AuthThrottleTestModule {}

  beforeEach(async () => {
    app = await NestFactory.create(AuthThrottleTestModule, { logger: false });
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
    passwordResetService.forgotPassword.mockClear();
    passwordResetService.resetPassword.mockClear();
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

  it("returns 429 after exceeding forgot limit", async () => {
    const body = { email: "ada@example.com" };
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send(body)
        .expect(200);
    }
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send(body)
      .expect(429);
  });

  it("returns 429 after exceeding reset limit", async () => {
    const body = { token: "reset-token", password: "secret123" };
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send(body)
        .expect(200);
    }
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send(body)
      .expect(429);
  });

  it("does not apply forgot limit to reset", async () => {
    const forgotBody = { email: "ada@example.com" };
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send(forgotBody)
        .expect(200);
    }
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: "reset-token", password: "secret123" })
      .expect(200);
  });
});
