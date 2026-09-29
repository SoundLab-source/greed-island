/**
 * Outgoing email (sign-in links). Development prints the message to the
 * console; production sends through SMTP when GI_SMTP_URL is set.
 */
import nodemailer, { type Transporter, type TransportOptions } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Prints mail instead of sending it. Keeps the last few messages for tests. */
export class ConsoleMailer implements Mailer {
  readonly sent: Mail[] = [];
  constructor(private readonly print: (line: string) => void = (l) => console.log(l)) {}

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    if (this.sent.length > 20) this.sent.shift();
    this.print(`\n[mail to ${mail.to}] ${mail.subject}\n${mail.text}\n`);
  }
}

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  constructor(
    smtpUrl: string | TransportOptions,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl as never);
  }

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
  }
}

export function loadMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const url = env["GI_SMTP_URL"];
  if (!url) return new ConsoleMailer();
  return new SmtpMailer(url, env["GI_MAIL_FROM"] ?? "Greed Island <no-reply@localhost>");
}

export function signInMail(email: string, link: string, minutes: number): Mail {
  return {
    to: email,
    subject: "Your Greed Island sign-in link",
    text: [
      "Click to sign in to Greed Island:",
      "",
      link,
      "",
      `The link works once and expires in ${minutes} minutes.`,
      "If you didn't ask for it, ignore this email.",
    ].join("\n"),
  };
}
