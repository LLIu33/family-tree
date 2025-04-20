import Joi from "joi";

// Объединенная схема валидации
const configValidationSchema = Joi.object({
  // Основные настройки приложения
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default("api"),
  SWAGGER_ENABLED: Joi.boolean().default(false),

  // Настройки Neo4j
  NEO4J_SCHEME: Joi.string().valid("neo4j", "bolt").default("bolt"),
  NEO4J_HOST: Joi.string().required(),
  NEO4J_PORT: Joi.number().port().default(7687),
  NEO4J_USERNAME: Joi.string().required(),
  NEO4J_PASSWORD: Joi.string().required(),
  NEO4J_DATABASE: Joi.string().default("neo4j"),

  // Настройки хранилища
  STORAGE_TYPE: Joi.string().valid("s3", "local").default("local"),
  STORAGE_LOCAL_PATH: Joi.string().default("./uploads"),
  STORAGE_MAX_FILE_SIZE_MB: Joi.number().default(10),
  STORAGE_ALLOWED_MIME_TYPES: Joi.string().default(
    "image/jpeg,image/png,image/gif,application/pdf"
  ),

  // AWS S3 (требуется если STORAGE_TYPE=s3)
  AWS_ACCESS_KEY_ID: Joi.when("STORAGE_TYPE", {
    is: "s3",
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  AWS_SECRET_ACCESS_KEY: Joi.when("STORAGE_TYPE", {
    is: "s3",
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  AWS_REGION: Joi.when("STORAGE_TYPE", {
    is: "s3",
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  AWS_S3_BUCKET: Joi.when("STORAGE_TYPE", {
    is: "s3",
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),

  // Аутентификация
  JWT_SECRET: Joi.string().default("secretKey"),
  JWT_EXPIRES_IN: Joi.string().default("7d"),

  // Настройки GEDCOM
  GEDCOM_MAX_FILE_SIZE_MB: Joi.number().default(50),
  GEDCOM_MAX_INDIVIDUALS: Joi.number().default(1000),
  GEDCOM_MAX_FAMILIES: Joi.number().default(500),
});

/**
 * Валидация конфигурации приложения
 * @param config Конфигурация для валидации
 * @throws Error Если валидация не пройдена
 */
export function validateConfig(config: Record<string, unknown>) {
  const { error, value } = configValidationSchema
    .prefs({ errors: { label: "key" } })
    .validate(config, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true,
    });

  if (error) {
    const validationErrors = error.details.map((detail) => {
      return {
        path: detail.path.join("."),
        message: detail.message,
        type: detail.type,
      };
    });

    throw new Error(
      `Config validation error:\n${validationErrors
        .map((err) => `- ${err.path}: ${err.message}`)
        .join("\n")}`
    );
  }

  return value;
}

// Вспомогательные типы для ошибок валидации
export interface ConfigValidationError {
  path: string[];
  message: string;
  type: string;
}

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ConfigValidationError[]
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }
}
