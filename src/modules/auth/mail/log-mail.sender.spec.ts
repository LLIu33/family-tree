import { LogMailSender } from "./log-mail.sender";

describe("LogMailSender", () => {
  it("logs password reset destination and url", async () => {
    const sender = new LogMailSender();
    const logSpy = jest
      .spyOn((sender as any).logger, "log")
      .mockImplementation(() => undefined);

    await sender.sendPasswordReset({
      to: "ada@example.com",
      resetUrl: "https://app.example/reset?token=abc",
    });

    expect(logSpy).toHaveBeenCalledWith(
      "Password reset for ada@example.com: https://app.example/reset?token=abc",
    );
  });
});
