"use client";

import { Patrick_Hand } from "next/font/google";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteNotepadLine,
  saveNotepadLine,
  setNotepadLineDone,
} from "@/app/actions/notepad";
import { MAX_NOTE_LINE, type NoteLine } from "@/lib/notepad";

// A handwriting-style font that is still easy to read.
const handwriting = Patrick_Hand({ weight: "400", subsets: ["latin"] });

const TYPING_PAUSE_MS = 800;
const SAVED_MESSAGE_MS = 2000;

// One bullet on the page. `line` is null until something has been saved.
type Item = { key: string; line: NoteLine | null; position: number };

let draftCount = 0;
const draft = (position: number): Item => ({
  key: `draft-${++draftCount}`,
  line: null,
  position,
});

// Saved lines, plus an empty line at the bottom to type into.
function itemsFrom(lines: NoteLine[]): Item[] {
  const items: Item[] = lines.map((l) => ({ key: l.id, line: l, position: l.position }));
  return [...items, draft((items.at(-1)?.position ?? 0) + 1)];
}

// Makes sure there is always an empty line at the bottom.
function withTrailingDraft(items: Item[]) {
  const last = items.at(-1);
  return last && !last.line ? items : [...items, draft((last?.position ?? 0) + 1)];
}

export function NotepadView({
  lines,
  userId,
  isAdmin,
}: {
  lines: NoteLine[];
  userId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState(() => itemsFrom(lines));
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Next.js keeps this page alive in the background between visits. When
  // the server sends fresh lines, show them (`version` reloads each line).
  const [synced, setSynced] = useState({ lines, version: 0 });
  if (lines !== synced.lines) {
    setSynced({ lines, version: synced.version + 1 });
    setItems(itemsFrom(lines));
  }

  const handleSaved = useCallback((key: string, line: NoteLine) => {
    setItems((prev) =>
      withTrailingDraft(prev.map((it) => (it.key === key ? { ...it, line } : it))),
    );
  }, []);

  const handleRemoved = useCallback((key: string) => {
    setItems((prev) => withTrailingDraft(prev.filter((it) => it.key !== key)));
  }, []);

  // Enter: start a new line straight after this one.
  // (Worked out from `items` directly, not inside setItems, so the new
  // line's key and the focus always match.)
  function handleEnter(key: string) {
    const i = items.findIndex((it) => it.key === key);
    if (i < 0) return;
    const next = items[i + 1];
    // The next line is already empty: just move into it.
    if (next && !next.line) {
      setFocusKey(next.key);
      return;
    }
    // Put the new line halfway between this one and the next.
    const position = next ? (items[i].position + next.position) / 2 : items[i].position + 1;
    const added = draft(position);
    setItems((prev) => {
      const j = prev.findIndex((it) => it.key === key);
      return [...prev.slice(0, j + 1), added, ...prev.slice(j + 1)];
    });
    setFocusKey(added.key);
  }

  function handleFocusPrevious(key: string) {
    const i = items.findIndex((it) => it.key === key);
    if (i > 0) setFocusKey(items[i - 1].key);
  }

  const handleFocused = useCallback(() => setFocusKey(null), []);

  return (
    // No card or paper effect: the lines sit straight on the white page.
    <div className="max-w-3xl">
      <ul className={handwriting.className}>
        {items.map((item, i) => (
          <NoteRow
            key={`${item.key}@${synced.version}`}
            item={item}
            isLast={i === items.length - 1}
            canEdit={!item.line || item.line.created_by === userId || isAdmin}
            isAdmin={isAdmin}
            autoFocus={focusKey === item.key}
            onFocused={handleFocused}
            onSaved={handleSaved}
            onRemoved={handleRemoved}
            onEnter={handleEnter}
            onFocusPrevious={handleFocusPrevious}
          />
        ))}
      </ul>
      <p className="mt-3 font-sans text-sm text-neutral-500">
        Press Enter for a new line. Changes save automatically.
      </p>
    </div>
  );
}

type Status = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };

function NoteRow({
  item,
  isLast,
  canEdit,
  isAdmin,
  autoFocus,
  onFocused,
  onSaved,
  onRemoved,
  onEnter,
  onFocusPrevious,
}: {
  item: Item;
  isLast: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  autoFocus: boolean;
  onFocused: () => void;
  onSaved: (key: string, line: NoteLine) => void;
  onRemoved: (key: string) => void;
  onEnter: (key: string) => void;
  onFocusPrevious: (key: string) => void;
}) {
  const [text, setText] = useState(item.line?.text ?? "");
  const [done, setDone] = useState(item.line?.done ?? false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef(text);
  const lineRef = useRef(item.line);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const queued = useRef<null | { allowDelete: boolean }>(null);
  const latest = useRef({ item, onSaved, onRemoved });

  useEffect(() => {
    latest.current = { item, onSaved, onRemoved };
  });

  // Move the cursor here when asked (e.g. after pressing Enter above).
  useEffect(() => {
    if (!autoFocus) return;
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
    onFocused();
  }, [autoFocus, onFocused]);

  const showSaved = useCallback(() => {
    setStatus({ kind: "saved" });
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(
      () => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)),
      SAVED_MESSAGE_MS,
    );
  }, []);

  // One save, using the latest text. An emptied line is deleted (on blur).
  const saveOnce = useCallback(
    async (allowDelete: boolean) => {
      const value = textRef.current.trim();
      const line = lineRef.current;
      const { item, onSaved, onRemoved } = latest.current;

      if (!value) {
        if (!allowDelete || !line) return;
        setStatus({ kind: "saving" });
        const result = await deleteNotepadLine(line.id);
        if (!result.ok) {
          setStatus({ kind: "error", message: result.error });
          return;
        }
        lineRef.current = null;
        onRemoved(item.key);
        return;
      }
      if (line && value === line.text) return; // nothing changed

      setStatus({ kind: "saving" });
      const result = await saveNotepadLine({
        id: line?.id ?? null,
        text: value,
        position: item.position,
      });
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      lineRef.current = result.line;
      showSaved();
      onSaved(item.key, result.line);
    },
    [showSaved],
  );

  // Saves run one after another, so a new line is never added twice.
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
        run = queued.current;
      }
      busy.current = false;
    },
    [saveOnce],
  );

  // Save anything still waiting if this line disappears from the page.
  useEffect(() => {
    return () => {
      if (timer.current) void flush(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [flush]);

  function handleChange(value: string) {
    textRef.current = value;
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(false), TYPING_PAUSE_MS);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!textRef.current.trim()) return; // no piles of empty lines
      void flush(false);
      onEnter(item.key);
    } else if (e.key === "Backspace" && textRef.current === "") {
      // Backspace on an empty line removes it and goes to the line above.
      e.preventDefault();
      onFocusPrevious(item.key);
      if (lineRef.current) void flush(true);
      else if (!isLast) onRemoved(item.key);
    }
  }

  async function handleTick(checked: boolean) {
    const line = lineRef.current;
    if (!line) return;
    setDone(checked); // show it straight away
    setStatus({ kind: "saving" });
    const result = await setNotepadLineDone(line.id, checked);
    if (!result.ok) {
      setDone(!checked);
      setStatus({ kind: "error", message: result.error });
      return;
    }
    lineRef.current = result.line;
    showSaved();
    onSaved(item.key, result.line);
  }

  const saved = Boolean(item.line);

  return (
    <li className="flex items-center gap-3 py-1">
      {isAdmin && (
        <input
          type="checkbox"
          aria-label={`Tick off: ${text || "empty line"}`}
          checked={done}
          disabled={!saved}
          onChange={(e) => void handleTick(e.target.checked)}
          className={`h-5 w-5 shrink-0 cursor-pointer accent-neutral-900 ${saved ? "" : "invisible"}`}
        />
      )}
      <span aria-hidden className="text-2xl text-neutral-500">
        •
      </span>
      <input
        ref={inputRef}
        type="text"
        aria-label={isLast && !saved ? "New notepad line" : "Notepad line"}
        placeholder={isLast && !saved ? "Write a new line…" : undefined}
        value={text}
        readOnly={!canEdit}
        maxLength={MAX_NOTE_LINE}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => void flush(true)}
        onKeyDown={handleKeyDown}
        className={`min-w-0 flex-1 bg-transparent py-1.5 text-2xl outline-none placeholder:text-neutral-400 ${
          done ? "text-neutral-400 line-through" : "text-neutral-900"
        } ${canEdit ? "" : "cursor-default"}`}
      />
      <span className="max-w-56 min-w-20 shrink-0 text-right font-sans text-sm">
        {status.kind === "saving" && <span className="text-neutral-500">Saving…</span>}
        {status.kind === "saved" && <span className="text-green-700">Saved ✓</span>}
        {status.kind === "error" && (
          <span role="alert" className="text-red-700" data-tip={status.message}>
            {status.message}
          </span>
        )}
      </span>
    </li>
  );
}
