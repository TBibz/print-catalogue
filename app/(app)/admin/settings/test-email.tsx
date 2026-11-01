"use client";

import { useState, useTransition } from "react";
import { sendTestEmail } from "@/app/actions/email";

// "Send test email": a plain message to any address, to check the SMTP
// settings (environment variables) without sending an invoice.
export function TestEmail({
  server,
}: {
  server: { host: string; port: string; fromEmail: string; missing: string[] };
}) {
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sent"; to: string } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const ready = server.missing.length === 0;

  function send() {
    startTransition(async () => {
      const result = await sendTestEmail(to);
      setStatus(result.ok ? { kind: "sent", to: to.trim() } : { kind: "error", message: result.error });
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="mt-8 max-w-2xl rounded-lg border border-neutral-200 p-4"
    >
      <label htmlFor="test-email-to" className="block font-medium">
        Email
      </label>
      {ready ? (
        <p className="mb-3 text-sm text-neutral-600">
          Invoices are sent through {server.host} (port {server.port}) from {server.fromEmail}. Send yourself a
          test email to check it works.
        </p>
      ) : (
        <p className="mb-3 text-sm text-neutral-600">
          Email isn’t set up yet. Add {server.missing.join(", ")} to the environment variables (in .env.local, and
          in Vercel), then redeploy.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="test-email-to"
          type="email"
          placeholder="name@example.com"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setStatus({ kind: "idle" });
          }}
          disabled={!ready}
          className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 disabled:bg-neutral-50"
        />
        <button
          type="submit"
          disabled={!ready || pending || !to.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send test email"}
        </button>
      </div>
      {status.kind === "sent" && (
        <p className="mt-2 text-sm text-green-700">
          Sent ✓ Check {status.to} (and its spam folder).
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {status.message}
        </p>
      )}
    </form>
  );
}
