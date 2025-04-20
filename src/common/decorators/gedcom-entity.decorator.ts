import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";
import { GEDCOM_ID_REGEX } from "../../constants/gedcom.constants";

/**
 * Декоратор для валидации GEDCOM ID в параметрах запроса
 * @param options Настройки валидации
 * @example
 * @Get(':id')
 * async getIndividual(
 *   @Param('id', new GedcomEntity({ type: 'individual' })) id: string
 * )
 */
export const GedcomEntity = createParamDecorator(
  (
    options: { type: "individual" | "family" | "event" | "media" },
    ctx: ExecutionContext
  ) => {
    const request = ctx.switchToHttp().getRequest();
    const id = request.params[options.type + "Id"] || request.params["id"];

    if (!id) {
      throw new BadRequestException(`${options.type} ID is required`);
    }

    if (!GEDCOM_ID_REGEX[options.type].test(id)) {
      throw new BadRequestException(
        `Invalid ${options.type} ID format. Expected pattern: ${GEDCOM_ID_REGEX[
          options.type
        ].toString()}`
      );
    }

    return id;
  }
);

// Альтернативный вариант с фабрикой для лучшей читаемости
export function GedcomEntityDecorator(
  type: "individual" | "family" | "event" | "media"
) {
  return createParamDecorator((_, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const id = request.params[type + "Id"] || request.params["id"];

    validateGedcomId(id, type);
    return id;
  });
}

// Валидация GEDCOM ID
function validateGedcomId(id: string, type: string) {
  if (!id) {
    throw new BadRequestException(`${type} ID is required`);
  }

  const typePatterns = {
    individual: /^I\d+$/,
    family: /^F\d+$/,
    event: /^E\d+$/,
    media: /^M\d+$/,
  };

  //   if (!typePatterns[type].test(id)) {
  //     throw new BadRequestException(
  //       `Invalid ${type} ID format. Expected pattern: ${typePatterns[
  //         type
  //       ].toString()}`
  //     );
  //   }
}
