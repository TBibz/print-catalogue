"use client";

import { useState, useTransition } from "react";
import { saveSetting, setResinChargeDivisor, type DivisorChange } from "@/app/actions/materials";
import { SETTINGS } from "@/lib/materials";
import { formatMoney } from "@/lib/money";

// One row per setting the app knows about (see SETTINGS in lib/materials).
export function SettingsForm({ values }: { values: Record<string, string> }) {
  return (
    <div className="max-w-2xl space-y-4">
      {SETTINGS.map((s) => (
        <SettingRow
          key={s.key}
          settingKey={s.key}
          label={s.label}
          help={s.help}
          kind={s.kind}
          initial={values[s.key] ?? s.defaultValue}
        />
      ))}
    </div>
  );
}

function SettingRow({
  settingKey,
  label,
  help,
  kind,
  initial,
}: {
  settingKey: string;
  label: string;
  help: string;
  kind: "number" | "text";
  initial: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  // The resin divisor first shows what it will do to existing jobs (0026).
  const [preview, setPreview] = useState<DivisorChange | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `setting-${settingKey}`;
  const isDivisor = settingKey === "resin_charge_divisor";

  function saveDivisor(apply: boolean) {
    startTransition(async () => {
      const result = await setResinChargeDivisor(value, apply);
      if (!result.ok) {
        setPreview(null);
        setStatus({ kind: "error", message: result.error });
        return;
      }
      // Nothing to confirm when no job changes: save straight away.
      if (!apply && result.change.jobsChanged > 0) {
        setPreview(result.change);
        return;
      }
      if (!apply) {
        const saved = await setResinChargeDivisor(value, true);
        if (!saved.ok) {
          setStatus({ kind: "error", message: saved.error });
          return;
        }
      }
      setPreview(null);
      setSaved(value.trim());
      setStatus({ kind: "saved" });
    });
  }

  function save() {
    if (isDivisor) return saveDivisor(false);
    startTransition(async () => {
      const result = await saveSetting(settingKey, value);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      setSaved(value.trim());
      setStatus({ kind: "saved" });
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="rounded-lg border border-neutral-200 p-4"
    >
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <p className="mb-3 text-sm text-neutral-600">{help}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          inputMode={kind === "number" ? "decimal" : "text"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus({ kind: "idle" });
            setPreview(null);
          }}
          className={`${kind === "number" ? "w-32" : "w-full max-w-md"} rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900`}
        />
        <button
          type="submit"
          disabled={pending || value.trim() === saved || preview !== null}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {status.kind === "saved" && <span className="text-sm text-green-700">Saved ✓</span>}
        {status.kind === "error" && (
          <span role="alert" className="text-sm text-red-700">
            {status.message}
          </span>
        )}
      </div>
      {preview && (
        <div role="alertdialog" aria-label="Confirm new divisor" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="text-amber-950">
            This will change the charge on {preview.jobsChanged} resin job{preview.jobsChanged === 1 ? "" : "s"} (total{" "}
            <span className="tabular-nums">{formatMoney(preview.totalBefore)}</span> →{" "}
            <span className="tabular-nums">{formatMoney(preview.totalAfter)}</span>).
          </p>
          <p className="mt-1 text-amber-900">
            Printing and completed resin jobs charged to Dad. Charges typed by hand, jobs not charged and
            cancelled jobs stay as they are.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => saveDivisor(true)}
              disabled={pending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Confirm and save"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={pending}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
