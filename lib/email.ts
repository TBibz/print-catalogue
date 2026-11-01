import "server-only";
import nodemailer from "nodemailer";

// All email sending lives here, so it can be switched to another service
// (e.g. Resend with a verified domain) by changing only this file.
//
// Today it sends through a Gmail account over SMTP, using two server-side
// environment variables (never sent to the browser):
//   GMAIL_USER          the Gmail address, e.g. someone@gmail.com
//   GMAIL_APP_PASSWORD  a 16-character Google "app password" for it

export function isEmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export type OutgoingEmail = {
  fromName: string; // shown as the sender's name
  replyTo: string;
  to: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
};

export async function sendEmail(email: OutgoingEmail): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email isn't set up yet (GMAIL_USER and GMAIL_APP_PASSWORD)." };
  }
  const user = process.env.GMAIL_USER!;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, "") },
  });

  try {
    await transport.sendMail({
      // Gmail only sends "from" its own address; the name is ours.
      from: { name: email.fromName, address: user },
      replyTo: email.replyTo || undefined,
      to: email.to,
      subject: email.subject,
      text: email.text,
      attachments: email.attachments,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sendEmail:", message);
    if (/Invalid login|Username and Password not accepted|EAUTH/i.test(message)) {
      return {
        ok: false,
        error: "Gmail didn't accept the login. Check GMAIL_USER and the app password.",
      };
    }
    if (/recipient|address/i.test(message)) {
      return { ok: false, error: "That email address wasn't accepted. Please check it." };
    }
    return { ok: false, error: "The email couldn't be sent. Please try again in a moment." };
  } finally {
    transport.close();
  }
}
