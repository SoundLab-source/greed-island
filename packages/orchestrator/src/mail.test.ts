import { describe, expect, it } from "vitest";
import { ConsoleMailer, loadMailer, signInMail, SmtpMailer } from "./mail.ts";

describe("mail", () => {
  it("prints to the console by default and keeps what it sent", async () => {
    const lines: string[] = [];
    const m = new ConsoleMailer((l) => lines.push(l));
    await m.send(signInMail("a@example.com", "https://x/?login=abc", 15));
    expect(m.sent[0]).toMatchObject({ to: "a@example.com", subject: "Your Greed Island sign-in link" });
    expect(lines[0]).toContain("https://x/?login=abc");
    expect(loadMailer({})).toBeInstanceOf(ConsoleMailer);
    expect(loadMailer({ GI_SMTP_URL: "smtp://user:pass@localhost:2525" })).toBeInstanceOf(SmtpMailer);
  });

  it("builds a message through the SMTP mailer's transport", async () => {
    const m = new SmtpMailer({ jsonTransport: true } as never, "GI <no-reply@example.com>");
    await expect(m.send(signInMail("b@example.com", "https://x/?login=def", 15))).resolves.toBeUndefined();
  });
});
