import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, randomUUID } from "crypto";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { Neo4jResultUtils } from "../../../common/utils/neo4j-result.utils";
import { MailConfig } from "../../../config/mail.config";
import { padLoginTiming } from "../auth-timing.utils";
import { MailSender } from "../interfaces/mail-sender.interface";
import { MAIL_SENDER, PASSWORD_RESET_TTL_MS } from "../mail/mail.constants";

const FORGOT_MESSAGE =
  "If an account exists for this email, a reset link has been sent.";
const RESET_MESSAGE = "Password updated. You can sign in.";

type UserRow = { id: string; email: string };

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly neo4j: Neo4jService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly config: ConfigService,
  ) {}

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.findUserByEmail(email);
    if (!user) {
      await padLoginTiming("password-reset-pad");
      return { message: FORGOT_MESSAGE };
    }
    await this.createAndSendReset(user);
    return { message: FORGOT_MESSAGE };
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ message: string }> {
    const userId = await this.findValidResetUserId(token);
    if (!userId) {
      throw new BadRequestException("Invalid or expired reset token");
    }
    const passwordHash = await (await import("bcrypt")).hash(password, 10);
    await this.applyPasswordReset(userId, passwordHash);
    return { message: RESET_MESSAGE };
  }

  private async findUserByEmail(email: string): Promise<UserRow | null> {
    const result = await this.neo4j.read(
      `MATCH (u:User {email: $email}) RETURN u`,
      { email: email.toLowerCase() },
    );
    if (result.records.length === 0) return null;
    const user = Neo4jResultUtils.normalizeValue(
      result.records[0].get("u"),
    ) as UserRow;
    return { id: user.id, email: user.email };
  }

  private async createAndSendReset(user: UserRow): Promise<void> {
    const raw = randomBytes(32).toString("base64url");
    const mailCfg = this.mailConfig();
    await this.neo4j.write(
      `
      MATCH (u:User {id: $userId})
      CREATE (reset:PasswordReset {
        id: $id,
        tokenHash: $tokenHash,
        expiresAt: datetime($expiresAt),
        createdAt: datetime()
      })
      CREATE (reset)-[:FOR_USER]->(u)
      `,
      {
        userId: user.id,
        id: randomUUID(),
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + mailCfg.passwordResetTtlMs).toISOString(),
      },
    );
    await this.mail.sendPasswordReset({
      to: user.email,
      resetUrl: `${mailCfg.appPublicUrl}/reset-password?token=${raw}`,
    });
  }

  private async findValidResetUserId(token: string): Promise<string | null> {
    const result = await this.neo4j.read(
      `
      MATCH (reset:PasswordReset {tokenHash: $tokenHash})-[:FOR_USER]->(u:User)
      WHERE reset.expiresAt > datetime()
      RETURN u.id AS userId
      LIMIT 1
      `,
      { tokenHash: this.hashToken(token) },
    );
    if (result.records.length === 0) return null;
    return String(result.records[0].get("userId"));
  }

  private async applyPasswordReset(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.neo4j.write(
      `
      MATCH (u:User {id: $userId})
      SET u.passwordHash = $passwordHash,
          u.passwordChangedAt = datetime()
      WITH u
      MATCH (r:PasswordReset)-[:FOR_USER]->(u)
      DETACH DELETE r
      `,
      { userId, passwordHash },
    );
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private mailConfig(): MailConfig {
    return (
      this.config.get<MailConfig>("mail") ?? {
        driver: "log",
        appPublicUrl: "http://localhost:5173",
        passwordResetTtlMs: PASSWORD_RESET_TTL_MS,
      }
    );
  }
}
