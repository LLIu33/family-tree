export interface SendPasswordResetInput {
  to: string;
  resetUrl: string;
}

export interface MailSender {
  sendPasswordReset(input: SendPasswordResetInput): Promise<void>;
}
