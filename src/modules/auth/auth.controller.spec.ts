import {
  INestApplication,
  Module,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

// Repo has no @types/supertest; esModuleInterop default import is required at runtime.
// @ts-expect-error -- no declaration file for supertest
import request from "supertest";

describe("AuthController throttling", () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn().mockResolvedValue({ accessToken: "t", user: {} }),
    register: jest.fn().mockResolvedValue({ accessToken: "t", user: {} }),
  };

  @Module({
    imports: [
      ThrottlerModule.forRoot([
        { name: "login", ttl: 60_000, limit: 5 },
        { name: "register", ttl: 60_000, limit: 3 },
      ]),
    ],
    controllers: [AuthController],
    providers: [{ provide: AuthService, useValue: authService }],
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
