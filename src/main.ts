import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import multer from "multer";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Настройка загрузки файлов
  app.use(
    multer({
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE_MB!) * 1024 * 1024,
      },
    }).single("file")
  );

  // Увеличение лимита размера JSON
  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));

  // Глобальная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
