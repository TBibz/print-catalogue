// The "Notepad (N)" count in the header: how many notepad lines aren't
// ticked off (blank ones don't count). One small shared value in the
// browser: the header reads it, the notepad page sets it the moment its
// lines change, and the header asks the database again on every page
// change (getUntickedNoteCount, counted in the database).
import { useSyncExternalStore } from "react";

let count: number | null = null; // null = not known yet
const listeners = new Set<() => void>();

export function setNotepadCount(next: number) {
  if (next === count) return;
  count = next;
  for (const listener of listeners) listener();
}

export function useNotepadCount() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => count,
    () => null,
  );
}
