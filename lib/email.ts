import "server-only";
import nodemailer from "nodemailer";

// All email sending lives here, so it can be switched to another service
// (e.g. Resend with a verified domain) by changing only this file.
//
// It sends through any SMTP mail server (Gmail, Outlook, a web host's mail,
// etc.), using server-side environment variables (never sent to the
// browser):
//   SMTP_HOST        the server, e.g. smtp.example.com
//   SMTP_PORT        465 (secure connection from the start, SSL/TLS) or
//                    587 (STARTTLS: starts plain, then switches to secure)
//   SMTP_USER        the login name, usually the email address
//   SMTP_PASSWORD    the password for that login
//   SMTP_FROM_EMAIL  the address emails come from (most servers only allow
//                    the login's own address)

const SETTING_NAMES = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"] as const;

// The settings that are still blank, e.g. ["SMTP_PASSWORD"].
export function missingEmailSettings(): string[] {
  return SETTING_NAMES.filter((name) => !process.env[name]?.trim());
}

export function isEmailConfigured() {
  return missingEmailSettings().length === 0;
}

// What the Settings page shows about the setup. No password, of course.
export function emailServerSummary() {
  return {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: process.env.SMTP_PORT?.trim() ?? "",
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim() ?? "",
    missing: missingEmailSettings(),
  };
}

export type OutgoingEmail = {
  fromName: string; // shown as the sender's name
  replyTo: string;
  to: string;
  subject: string;
  text: string;
  // Always sent as real attachments (Content-Disposition: attachment), never
  // shown inline in the message.
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export async function sendEmail(email: OutgoingEmail): Promise<{ ok: true } | { ok: false; error: string }> {
  const missing = missingEmailSettings();
  if (missing.length > 0) {
    return { ok: false, error: `Email isn't set up yet (missing ${missing.join(", ")}).` };
  }
  const port = Number(process.env.SMTP_PORT!.trim());
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { ok: false, error: "SMTP_PORT should be a number, usually 465 or 587." };
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    // 465: secure from the first byte. Anything else (587): start plain and
    // switch to secure with STARTTLS, and refuse to go on if the server
    // can't, so the password is never sent unprotected.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASSWORD! },
    // Give up rather than hang if the server doesn't answer.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  try {
    await transport.sendMail({
      from: { name: email.fromName, address: process.env.SMTP_FROM_EMAIL!.trim() },
      replyTo: email.replyTo || undefined,
      to: email.to,
      subject: email.subject,
      text: email.text,
      attachments: email.attachments?.map((a) => ({ ...a, contentDisposition: "attachment" as const })),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  } finally {
    transport.close();
  }
}

// Turns what the mail server said into plain English. The full technical
// message goes to the server log (Vercel → Logs) for checking.
function friendlyError(error: unknown): string {
  const e = (error ?? {}) as { code?: string; responseCode?: number; command?: string; message?: string };
  const message = e.message ?? String(error);
  console.error("sendEmail:", e.code, e.responseCode, e.command, message);

  if (e.code === "EAUTH" || e.code === "ENOAUTH" || e.responseCode === 535 || e.responseCode === 534) {
    return "The email server refused the password. Check SMTP_USER and SMTP_PASSWORD.";
  }
  if (e.code === "EDNS" || /ENOTFOUND|EAI_AGAIN/.test(message)) {
    return "Couldn't find the email server. Check SMTP_HOST.";
  }
  if (e.code === "ETLS") {
    return "Couldn't make a secure connection to the email server. Check SMTP_PORT (465 or 587).";
  }
  if (
    e.code === "ECONNECTION" ||
    e.code === "ETIMEDOUT" ||
    e.code === "ESOCKET" ||
    e.code === "EPROTOCOL" ||
    /ECONNREFUSED|ECONNRESET|wrong version number/i.test(message)
  ) {
    return "Couldn't connect to the email server. Check SMTP_HOST and SMTP_PORT (465 or 587).";
  }
  if (e.code === "EENVELOPE") {
    if (e.command === "MAIL FROM") {
      return "The email server won't send from SMTP_FROM_EMAIL. Use the address that belongs to SMTP_USER.";
    }
    return "That email address wasn't accepted. Please check it.";
  }
  return "The email couldn't be sent. Please try again in a moment.";
}
