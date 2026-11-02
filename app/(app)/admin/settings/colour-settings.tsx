"use client";

import { useState, useTransition } from "react";
import { saveSetting } from "@/app/actions/materials";
import { ColourPicker } from "@/components/colour-picker";
import { isTooDarkForRows, textColourOn } from "@/lib/colours";
import { THEME_COLOURS, type ThemeGroup } from "@/lib/theme";

// Settings → Colours: row highlights, table headers, the invoice document
// and urgency pills (lib/theme.ts). Each has a picker, a live preview, Save
// and "Reset to default". Saved colours show across the app straight away.
const GROUPS: { group: ThemeGroup; title: string; help: string }[] = [
  {
    group: "rows",
    title: "Row highlights",
    help: "When more than one applies: currently printing, then new, then requested, then the alternate stripe. Keep these light so the text stays easy to read.",
  },
  { group: "headers", title: "Header colours", help: "The text switches between white and dark to suit the colour." },
  { group: "urgency", title: "Urgency", help: "The text switches between white and dark to suit the colour." },
];

type Colour = (typeof THEME_COLOURS)[number];

export function ColourSettings({ values }: { values: Record<string, string> }) {
  return (
    <section className="mt-10 max-w-2xl">
      <h2 className="mb-1 text-xl font-semibold">Colours</h2>
      <p className="mb-4 text-sm text-neutral-600">Only you can change these; everyone sees them.</p>
      {GROUPS.map((g) => (
        <div key={g.group} className="mb-6">
          <h3 className="font-medium">{g.title}</h3>
          <p className="mb-2 text-sm text-neutral-600">{g.help}</p>
          <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {THEME_COLOURS.filter((c) => c.group === g.group).map((c) => (
              <ColourRow key={c.key} colour={c} initial={values[c.key] ?? c.defaultValue} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ColourRow({ colour, initial }: { colour: Colour; initial: string }) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    setStatus({ kind: "idle" });
    startTransition(async () => {
      const result = await saveSetting(colour.key, next);
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setValue(next);
      setSaved(next);
      setStatus({ kind: "saved" });
    });
  }

  const tooDark = colour.group === "rows" && isTooDarkForRows(value);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <div className="w-44">
        <div className="font-medium">{colour.label}</div>
        {colour.help && <div className="text-xs text-neutral-600">{colour.help}</div>}
      </div>
      <ColourPicker
        value={value}
        label={colour.label}
        onChange={(hex) => {
          setValue(hex);
          setStatus({ kind: "idle" });
        }}
      />
      <Preview colour={colour} hex={value} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save(value)}
          disabled={pending || value === saved}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {(value !== colour.defaultValue || saved !== colour.defaultValue) && (
          <button
            type="button"
            onClick={() => save(colour.defaultValue)}
            disabled={pending}
            className="text-sm text-neutral-700 underline hover:no-underline disabled:opacity-40"
          >
            Reset to default
          </button>
        )}
        {status.kind === "saved" && <span className="text-sm text-green-700">Saved ✓</span>}
      </div>
      {status.kind === "error" && (
        <p role="alert" className="w-full text-sm text-red-700">
          {status.message}
        </p>
      )}
      {tooDark && (
        <p className="w-full text-sm text-amber-800">
          This colour is quite dark: dark text on it may be hard to read. You can still use it.
        </p>
      )}
    </div>
  );
}

// What it will look like, updating as the picker moves.
function Preview({ colour, hex }: { colour: Colour; hex: string }) {
  if (colour.group === "rows") {
    return (
      <span
        className="inline-flex h-8 min-w-[11rem] items-center rounded border border-neutral-200 px-3 text-sm text-neutral-900"
        style={{ backgroundColor: hex }}
      >
        <span className="mr-2 font-mono">SW001</span> Darth Vader
      </span>
    );
  }
  if (colour.group === "urgency") {
    return (
      <span
        className="inline-block rounded-full border px-3 py-1 text-sm font-semibold"
        style={{ backgroundColor: hex, borderColor: hex, color: textColourOn(hex) }}
      >
        {colour.key === "colour_urgency_asap" ? "ASAP" : "PRIORITY"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-8 min-w-[11rem] items-center rounded px-3 text-xs font-bold tracking-wide uppercase"
      style={{ backgroundColor: hex, color: textColourOn(hex) }}
    >
      {colour.key === "colour_invoice" ? "Grand total £123.45" : "Code · Name · Qty"}
    </span>
  );
}
