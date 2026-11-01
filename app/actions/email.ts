"use server";

// "Send test email" on the Settings page (admin only): checks the SMTP
// settings work without sending an invoice.
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { loadCompany } from "@/lib/invoice-data";

export async function sendTestEmail(to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const address = String(to ?? "").trim();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(address)) {
    return { ok: false, error: "Enter one email address, e.g. name@example.com." };
  }

  const supabase = await createClient();
  const company = await loadCompany(supabase);
  return sendEmail({
    fromName: company.name,
    replyTo: company.email,
    to: address,
    subject: `Test email from ${company.name}`,
    text:
      "This is a test email from the Print Catalogue.\n\n" +
      "If you can read this, the email settings work and invoices can be sent.",
  });
}
