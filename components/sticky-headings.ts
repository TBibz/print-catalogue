// Column headings for the tables (catalogue, queue, models, invoice builder
// and invoices list): bold text on the header colour from Settings → Colours
// (lib/theme.ts), white or dark to suit it. They stick to the top of the
// screen while scrolling, right under the site header when it's showing
// (--nav-offset, set by components/auto-hide-header.tsx) and move with it.
const BASE =
  "sticky top-[var(--nav-offset)] z-20 text-xs font-bold tracking-wide uppercase transition-[top] duration-200 ease-out";

// Written out in full so Tailwind finds the classes.
const COLOURS = {
  catalogue: "bg-[var(--colour-head-catalogue)] text-[var(--colour-head-catalogue-text)]",
  queue: "bg-[var(--colour-head-queue)] text-[var(--colour-head-queue-text)]",
  models: "bg-[var(--colour-head-models)] text-[var(--colour-head-models-text)]",
  builder: "bg-[var(--colour-head-builder)] text-[var(--colour-head-builder-text)]",
};

export function stickyHeadings(table: keyof typeof COLOURS) {
  return `${BASE} ${COLOURS[table]}`;
}
