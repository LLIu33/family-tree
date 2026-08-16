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
