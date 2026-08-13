import "reflect-metadata";
import { existsSync } from "fs";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded, static as expressStatic } from "express";
import type { Request, Response, NextFunction } from "express";
import { AppModule } from "./app.module";
import { SwaggerConfig } from "./config/swagger.config";

function isApiPath(path: string): boolean {
  return (
    path.startsWith("/family-tree") ||
    path.startsWith("/auth") ||
    path.startsWith("/api-docs") ||
    path === "/health"
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const http = app.getHttpAdapter().getInstance();

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));

  http.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  const swagger = configService.get<SwaggerConfig>("swagger");
  if (swagger?.enabled) {
    const documentBuilder = new DocumentBuilder()
      .setTitle(swagger.title)
      .setDescription(swagger.description)
      .setVersion(swagger.version)
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, documentBuilder);
    SwaggerModule.setup(swagger.path, app, document);
  }

  const serveWeb =
    (process.env.SERVE_WEB || "").toLowerCase() === "true" ||
    process.env.SERVE_WEB === "1";
  const webRoot = join(__dirname, "..", "public");
  if (serveWeb && existsSync(webRoot)) {
    app.use(expressStatic(webRoot));
    http.get("*", (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || isApiPath(req.path)) {
        next();
        return;
      }
      res.sendFile(join(webRoot, "index.html"), (err) => {
        if (err) next();
      });
    });
  }

  await app.listen(configService.get<number>("PORT") || 3000, "0.0.0.0");
}

bootstrap();
