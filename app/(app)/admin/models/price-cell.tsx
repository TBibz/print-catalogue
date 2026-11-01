"use client";

// A model's price on the Models page: a £ box that saves by itself, when you
// leave it or after a short pause in typing. Blank = no price set.
import { useEffect, useRef, useState } from "react";
import { setModelPrice } from "@/app/actions/models";
import { MoneyInput } from "@/components/money-input";
import { formatMoneyInput, parseMoney } from "@/lib/money";

const TYPING_PAUSE_MS = 800;
const SAVED_MESSAGE_MS = 2500;

const asText = (price: number | null) => (price === null ? "" : formatMoneyInput(Number(price)));

export function PriceCell({
  modelId,
  code,
  price,
  onSaved,
}: {
  modelId: string;
  code: string;
  price: number | null;
  onSaved: (modelId: string, price: number | null) => void;
}) {
  const [text, setText] = useState(() => asText(price));
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }>({
    kind: "idle",
  });
  const textRef = useRef(text);
  const savedRef = useRef<number | null>(price === null ? null : Number(price));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  const focused = useRef(false);

  // Always show the current saved price. `price` changes when the list gets
  // fresh data (coming back to the page, which Next.js keeps alive in the
  // background) or after "Set price for N selected". The box only follows
  // it while you aren't typing in it or saving, so it never overwrites what
  // you're typing.
  useEffect(() => {
    if (focused.current || timer.current || busy.current) return;
    const next = price === null ? null : Number(price);
    if (next === savedRef.current && parseMoney(textRef.current) === next) return;
    savedRef.current = next;
    textRef.current = asText(next);
    setText(textRef.current);
  }, [price]);

  async function save() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // One save at a time; a change made meanwhile is saved straight after.
    if (busy.current) {
      again.current = true;
      return;
    }
    const value = parseMoney(textRef.current);
    if (Number.isNaN(value)) {
      setStatus({ kind: "error", message: "Not a valid amount" });
      return;
    }
    if (value === savedRef.current) {
      setStatus((s) => (s.kind === "error" ? { kind: "idle" } : s));
      return;
    }
    busy.current = true;
    setStatus({ kind: "saving" });
    const result = await setModelPrice(modelId, value);
    busy.current = false;
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
    } else {
      savedRef.current = result.price;
      setStatus({ kind: "saved" });
      setTimeout(() => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)), SAVED_MESSAGE_MS);
      onSaved(modelId, result.price);
    }
    if (again.current) {
      again.current = false;
      void save();
    }
  }

  // Save anything still waiting if the row goes away (e.g. a filter change).
  useEffect(
    () => () => {
      if (timer.current) void save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
    [],
  );

  return (
    // Enter only leaves the box; it mustn't submit the model editor's form.
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      onFocus={() => (focused.current = true)}
      onBlur={() => (focused.current = false)}
    >
      <span className="flex items-center gap-1">
        {/* Just wide enough for "£ 9,999.99". */}
        <MoneyInput
          label={`Price for ${code}`}
          value={text}
          compact
          className="w-[6.5rem]"
          onChange={(v) => {
            textRef.current = v;
            setText(v);
            setStatus({ kind: "idle" });
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void save(), TYPING_PAUSE_MS);
          }}
          onBlur={() => void save()}
        />
        {/* A small mark beside the box, so the row stays one line. */}
        <span className="w-4 shrink-0 text-center text-xs" aria-live="polite">
          {status.kind === "saving" && (
            <span className="text-neutral-400" data-tip="Saving…">
              …<span className="sr-only">Saving</span>
            </span>
          )}
          {status.kind === "saved" && (
            <span className="text-green-700" data-tip="Saved">
              ✓<span className="sr-only">Saved</span>
            </span>
          )}
          {status.kind === "error" && (
            <span aria-hidden className="font-bold text-red-700" data-tip={status.message}>
              !
            </span>
          )}
        </span>
      </span>
      {status.kind === "error" && (
        <span role="alert" className="block text-xs text-red-700">
          {status.message}
        </span>
      )}
    </div>
  );
}
