"use client";

import { useState, useTransition } from "react";
import { saveSetting } from "@/app/actions/materials";
import { SETTINGS } from "@/lib/materials";

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
  const [pending, startTransition] = useTransition();
  const id = `setting-${settingKey}`;

  function save() {
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
          }}
          className={`${kind === "number" ? "w-32" : "w-full max-w-md"} rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900`}
        />
        <button
          type="submit"
          disabled={pending || value.trim() === saved}
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
    </form>
  );
}
