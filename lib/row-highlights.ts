// Row highlight colours (Settings → Colours, lib/theme.ts). When more than
// one applies, the first wins: currently printing > new > requested >
// the alternate stripe on every other row. Written out in full so
// Tailwind finds the classes.
export const ROW_PRINTING = "bg-[var(--colour-row-printing)]";
export const ROW_NEW = "bg-[var(--colour-row-new)]";
export const ROW_REQUESTED = "bg-[var(--colour-row-requested)]";
export const ROW_ALT = "even:bg-[var(--colour-row-alt)]";

export function rowHighlight({
  printing = false,
  isNew = false,
  requested = false,
}: {
  printing?: boolean;
  isNew?: boolean;
  requested?: boolean;
}) {
  if (printing) return ROW_PRINTING;
  if (isNew) return ROW_NEW;
  if (requested) return ROW_REQUESTED;
  return ROW_ALT;
}

// Grid cards have no stripe: plain white unless highlighted.
export function cardHighlight(flags: { printing?: boolean; isNew?: boolean; requested?: boolean }) {
  const row = rowHighlight(flags);
  return row === ROW_ALT ? "bg-white" : row;
}
