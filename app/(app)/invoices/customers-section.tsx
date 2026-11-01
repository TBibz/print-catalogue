"use client";

// Customers: who invoices are emailed to. The default one is filled in on
// new invoices and in the Send panel.
import { useState, useTransition } from "react";
import { deleteCustomer, saveCustomer, setDefaultCustomer } from "@/app/actions/invoices";
import type { Customer } from "@/lib/invoices";

const box =
  "h-9 w-full rounded-md border border-neutral-300 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

export function CustomersSection({ customers: serverCustomers }: { customers: Customer[] }) {
  const [customers, setCustomers] = useState(serverCustomers);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [synced, setSynced] = useState(serverCustomers);
  if (serverCustomers !== synced) {
    setSynced(serverCustomers);
    setCustomers(serverCustomers);
    setEditing(null);
  }

  function makeDefault(id: string | null) {
    startTransition(async () => {
      const r = await setDefaultCustomer(id);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setCustomers((prev) => prev.map((c) => ({ ...c, is_default: c.id === id })));
      setMessage({ ok: true, text: id ? "Default customer changed ✓" : "No default customer now." });
    });
  }

  function remove(c: Customer) {
    if (!window.confirm(`Delete the customer ${c.name || c.email}? Invoices already made aren't affected.`)) return;
    startTransition(async () => {
      const r = await deleteCustomer(c.id);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
      setMessage({ ok: true, text: "Customer deleted." });
    });
  }

  return (
    <section className="mt-10 max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Customers</h2>
          <p className="text-sm text-neutral-600">
            The default customer’s email is filled in when you send an invoice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setEditing("new");
          }}
          disabled={editing === "new"}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40"
        >
          + Add customer
        </button>
      </div>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mb-3 rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.text}
        </p>
      )}

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {editing === "new" && (
          <CustomerEditor
            customer={null}
            onSaved={(c) => {
              setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
              setEditing(null);
              setMessage({ ok: true, text: "Customer added ✓" });
            }}
            onCancel={() => setEditing(null)}
          />
        )}
        {customers.length === 0 && editing !== "new" && (
          <li className="px-4 py-4 text-sm text-neutral-600">No customers yet.</li>
        )}
        {customers.map((c) =>
          editing === c.id ? (
            <CustomerEditor
              key={c.id}
              customer={c}
              onSaved={(saved) => {
                setCustomers((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
                setEditing(null);
                setMessage({ ok: true, text: "Customer saved ✓" });
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.name || "—"}</span>
                {c.is_default && (
                  <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-white">Default</span>
                )}
                <span className="block text-neutral-600">{c.email || "No email"}</span>
              </span>
              {c.is_default ? (
                <button
                  type="button"
                  onClick={() => makeDefault(null)}
                  disabled={pending}
                  className="text-neutral-600 underline hover:no-underline"
                >
                  Remove default
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => makeDefault(c.id)}
                  disabled={pending}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-100"
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setEditing(c.id);
                }}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(c)}
                disabled={pending}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function CustomerEditor({
  customer,
  onSaved,
  onCancel,
}: {
  customer: Customer | null;
  onSaved: (c: Customer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <li className="bg-neutral-50 px-4 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await saveCustomer({ id: customer?.id ?? null, name, email });
            if (!r.ok) setError(r.error);
            else onSaved(r.customer);
          });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="min-w-48 flex-1 text-sm">
          <span className="mb-1 block text-neutral-700">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={box} />
        </label>
        <label className="min-w-56 flex-1 text-sm">
          <span className="mb-1 block text-neutral-700">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={box} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : customer ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-md border border-neutral-300 bg-white px-4 text-sm hover:bg-neutral-100"
        >
          Cancel
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
