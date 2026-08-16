import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { PasswordResetService } from "./password-reset.service";

jest.mock("bcrypt", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
  compare: jest.fn().mockResolvedValue(true),
}));

describe("PasswordResetService", () => {
  let service: PasswordResetService;
  let neo4j: { read: jest.Mock; write: jest.Mock };
  let mail: { sendPasswordReset: jest.Mock };
  const forgotMessage =
    "If an account exists for this email, a reset link has been sent.";

  const record = (values: Record<string, unknown>) => ({
    get: (key: string) => values[key],
  });

  beforeEach(() => {
    neo4j = { read: jest.fn(), write: jest.fn() };
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const config = {
      get: jest.fn().mockReturnValue({
        driver: "log",
        appPublicUrl: "http://localhost:5173",
        passwordResetTtlMs: 3_600_000,
      }),
    };
    service = new PasswordResetService(
      neo4j as unknown as Neo4jService,
      mail as never,
      config as unknown as ConfigService,
    );
  });

  it("forgotPassword returns the same message when user is missing without writing or mailing", async () => {
    neo4j.read.mockResolvedValue({ records: [] });

    await expect(
      service.forgotPassword("missing@example.com"),
    ).resolves.toEqual({ message: forgotMessage });

    expect(neo4j.write).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("forgotPassword writes a reset and mails a reset-password token URL when user exists", async () => {
    neo4j.read.mockResolvedValue({
      records: [
        record({
          u: { id: "user-1", email: "ada@example.com", name: "Ada" },
        }),
      ],
    });
    neo4j.write.mockResolvedValue({ records: [] });

    await expect(
      service.forgotPassword("Ada@Example.com"),
    ).resolves.toEqual({ message: forgotMessage });

    expect(neo4j.write).toHaveBeenCalled();
    expect(mail.sendPasswordReset).toHaveBeenCalledWith({
      to: "ada@example.com",
      resetUrl: expect.stringContaining("/reset-password?token="),
    });
  });

  it("resetPassword updates passwordHash and deletes resets for a valid token", async () => {
    neo4j.read.mockResolvedValue({
      records: [record({ userId: "user-1" })],
    });
    neo4j.write.mockResolvedValue({ records: [] });

    await expect(
      service.resetPassword("valid-token", "new-secret"),
    ).resolves.toEqual({
      message: "Password updated. You can sign in.",
    });

    const [query, params] = neo4j.write.mock.calls[0];
    expect(query).toContain("passwordHash");
    expect(query).toContain("DETACH DELETE");
    expect(params.passwordHash).toBe("hashed-password");
    expect(params.userId).toBe("user-1");
  });

  it("resetPassword throws BadRequest for an unknown token", async () => {
    neo4j.read.mockResolvedValue({ records: [] });

    await expect(
      service.resetPassword("unknown-token", "new-secret"),
    ).rejects.toThrow(BadRequestException);

    expect(neo4j.write).not.toHaveBeenCalled();
  });
});
