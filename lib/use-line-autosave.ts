"use client";

// Autosave for one request line (quantity, urgency, note, scale).
//
// - Typing saves after a short pause; leaving a box (blur) saves at once.
// - Dropdowns save at once.
// - Saves for one line run one at a time, so a new line is never created
//   twice and the last change always wins.
// - A blank/0 quantity deletes the line, but only on blur. Otherwise
//   clearing the box to retype a number would wipe the note mid-edit.

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRequestLine, saveRequestLine } from "@/app/actions/requests";
import type { RequestLine, Urgency } from "@/lib/requests";

const TYPING_PAUSE_MS = 800;
const SAVED_MESSAGE_MS = 2500;

export type LineFields = {
  scale: string | null; // null = default scale
  quantity: string; // kept as typed, so the box can be blank
  urgency: Urgency | null;
  note: string;
};

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "pending" } // waiting for the typing pause
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "hint"; message: string } // not an error, e.g. "add a quantity"
  | { kind: "error"; message: string };

type Options = {
  modelId: string;
  line: RequestLine | null;
  initialScale?: string | null;
  onSaved: (line: RequestLine) => void;
  onDeleted: () => void;
};

function fieldsFrom(line: RequestLine | null, scale: string | null): LineFields {
  return line
    ? {
        scale: line.scale,
        quantity: String(line.quantity),
        urgency: line.urgency,
        note: line.note,
      }
    : { scale, quantity: "", urgency: null, note: "" };
}

// The same rule is enforced by the database, for everyone.
const printingMessage = (printing: number) =>
  `${printing} ${printing === 1 ? "is" : "are"} being printed, so the quantity can't go below ${printing}.`;

const sameFields = (a: LineFields, b: LineFields) =>
  a.scale === b.scale &&
  a.quantity.trim() === b.quantity.trim() &&
  a.urgency === b.urgency &&
  a.note.trim() === b.note.trim();

export function useLineAutosave({
  modelId,
  line,
  initialScale = null,
  onSaved,
  onDeleted,
}: Options) {
  const [fields, setFields] = useState<LineFields>(() => fieldsFrom(line, initialScale));
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  // Refs hold the latest values for the async save code.
  const fieldsRef = useRef(fields);
  const lineRef = useRef(line);
  const savedRef = useRef<LineFields | null>(line ? fieldsFrom(line, null) : null);
  const callbacks = useRef({ onSaved, onDeleted });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const queued = useRef<null | { allowDelete: boolean }>(null);

  useEffect(() => {
    callbacks.current = { onSaved, onDeleted };
  });

  const showSaved = useCallback(() => {
    setStatus({ kind: "saved" });
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(
      () => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)),
      SAVED_MESSAGE_MS,
    );
  }, []);

  // Does one save or delete, based on the latest field values.
  const saveOnce = useCallback(
    async (allowDelete: boolean) => {
      const current = fieldsRef.current;
      const qtyText = current.quantity.trim();
      const existing = lineRef.current;

      // ---- Blank or 0 quantity: delete (on blur only) -------------------
      if (qtyText === "" || qtyText === "0") {
        if (!allowDelete) {
          setStatus({ kind: "idle" });
          return;
        }
        if (existing && existing.printing > 0) {
          setStatus({ kind: "error", message: printingMessage(existing.printing) });
          return;
        }
        if (!existing) {
          const hasOther = current.urgency !== null || current.note.trim() !== "";
          setStatus(
            hasOther
              ? { kind: "hint", message: "Add a quantity to save" }
              : { kind: "idle" },
          );
          return;
        }
        setStatus({ kind: "saving" });
        const result = await deleteRequestLine(existing.id);
        if (!result.ok) {
          setStatus({ kind: "error", message: result.error });
          return;
        }
        lineRef.current = null;
        savedRef.current = null;
        // Back to a completely blank row (the size choice stays).
        const blank = fieldsFrom(null, current.scale);
        fieldsRef.current = blank;
        setFields(blank);
        showSaved();
        callbacks.current.onDeleted();
        return;
      }

      // ---- Check the quantity -------------------------------------------
      const quantity = Number(qtyText);
      if (!Number.isInteger(quantity) || quantity < 0) {
        setStatus({ kind: "error", message: "Quantity must be a whole number" });
        return;
      }
      const printing = existing?.printing ?? 0;
      if (quantity < printing) {
        setStatus({ kind: "error", message: printingMessage(printing) });
        return;
      }

      // Nothing changed since the last save.
      if (savedRef.current && sameFields(current, savedRef.current)) {
        setStatus((s) => (s.kind === "saving" || s.kind === "pending" ? { kind: "idle" } : s));
        return;
      }

      // ---- Save -----------------------------------------------------------
      setStatus({ kind: "saving" });
      const result = await saveRequestLine({
        id: existing?.id ?? null,
        modelId,
        scale: current.scale,
        quantity,
        urgency: current.urgency,
        note: current.note,
      });
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      lineRef.current = result.line;
      savedRef.current = fieldsFrom(result.line, null);
      showSaved();
      callbacks.current.onSaved(result.line);
    },
    [modelId, showSaved],
  );

  // Runs saves one after another. If a save is asked for while one is
  // running, it runs again straight afterwards with the newest values.
  const flush = useCallback(
    async (allowDelete: boolean) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (busy.current) {
        queued.current = { allowDelete: allowDelete || Boolean(queued.current?.allowDelete) };
        return;
      }
      busy.current = true;
      let run: { allowDelete: boolean } | null = { allowDelete };
      while (run) {
        queued.current = null;
        try {
          await saveOnce(run.allowDelete);
        } catch {
          setStatus({ kind: "error", message: "Couldn't save. Please try again." });
        }
        run = queued.current; // anything asked for while we were saving
      }
      busy.current = false;
    },
    [saveOnce],
  );

  // Change one field. `when` controls how soon it saves.
  const update = useCallback(
    <K extends keyof LineFields>(
      key: K,
      value: LineFields[K],
      when: "now" | "after-pause" = "after-pause",
    ) => {
      const next = { ...fieldsRef.current, [key]: value };
      fieldsRef.current = next;
      setFields(next);

      if (when === "now") {
        void flush(true);
        return;
      }
      setStatus({ kind: "pending" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(false), TYPING_PAUSE_MS);
    },
    [flush],
  );

  // Call from a text box's onBlur.
  const commit = useCallback(() => void flush(true), [flush]);

  // Save anything still waiting if the row disappears (e.g. tab change),
  // and warn before closing the page with unsaved typing.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || busy.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) void flush(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [flush]);

  return { fields, status, update, commit, retry: commit };
}
