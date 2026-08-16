import "reflect-metadata";
import { existsSync } from "fs";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { SwaggerConfig } from "./config/swagger.config";

function isApiPath(path: string): boolean {
  return (
    path.startsWith("/family-tree") ||
    path.startsWith("/auth") ||
    path.startsWith("/api-docs") ||
    path.startsWith("/trees") ||
    path.startsWith("/invites") ||
    path === "/health"
  );
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: true,
    credentials: true,
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
    const { DocumentBuilder, SwaggerModule } = await import("@nestjs/swagger");
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
    app.useStaticAssets(webRoot, { index: "index.html" });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || isApiPath(req.path)) {
        next();
        return;
      }
      res.sendFile(join(webRoot, "index.html"), (err?: Error) => {
        if (err) next(err);
      });
    });
    Logger.log(`Serving web UI from ${webRoot}`, "Bootstrap");
  } else if (serveWeb) {
    Logger.warn(
      `SERVE_WEB is on but ${webRoot} is missing — / will 404`,
      "Bootstrap"
    );
  }

  const port = Number(process.env.PORT) || configService.get<number>("PORT") || 3000;
  await app.listen(port, "0.0.0.0");
  Logger.log(`Listening on 0.0.0.0:${port}`, "Bootstrap");
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error", err);
  process.exit(1);
});
