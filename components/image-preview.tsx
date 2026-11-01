"use client";

// The floating image preview shown while hovering a model's code or name:
// in the catalogue list, the invoice builder and draft invoices, so they
// all behave the same.
//
// It sits to the right of the pointer (or to its left if there isn't
// room), just below the row being hovered (or just above it near the
// bottom of the window), so it never covers that row's own controls (tick
// box, quantity…). The code and name are shown underneath the picture.
// It goes away when the mouse leaves, the page scrolls, or a key is
// pressed (e.g. typing a quantity). Models without an image get nothing.
import { useEffect, useState } from "react";

export const PREVIEW_SIZE = 288; // px, the picture box
const GAP = 20; // px between the pointer and the preview
const ROW_GAP = 6; // px between the hovered row and the preview
const EDGE = 8; // px kept clear of the window's edges
const CAPTION_HEIGHT = 36; // px, room for the caption under the picture

type Hover = { x: number; rowTop: number; rowBottom: number };

// Usage: const preview = useImagePreview(url, "SW001 Darth Vader");
// spread preview.handlers on the code and name, render preview.element.
export function useImagePreview(url: string | null, caption: string) {
  const [hover, setHover] = useState<Hover | null>(null);
  const showing = hover !== null;

  useEffect(() => {
    if (!showing) return;
    const hide = () => setHover(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    document.addEventListener("keydown", hide, true);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
      document.removeEventListener("keydown", hide, true);
    };
  }, [showing]);

  const handlers = url
    ? {
        onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
          // The whole row (list item or table row), so the preview can keep
          // clear of it.
          const row = (e.currentTarget.closest("li, tr") ?? e.currentTarget).getBoundingClientRect();
          setHover({ x: e.clientX, rowTop: row.top, rowBottom: row.bottom });
        },
        onMouseLeave: () => setHover(null),
      }
    : {};

  return {
    handlers,
    hide: () => setHover(null),
    element: hover && url ? <ImagePreview url={url} caption={caption} hover={hover} /> : null,
  };
}

function ImagePreview({ url, caption, hover }: { url: string; caption: string; hover: Hover }) {
  const width = PREVIEW_SIZE;
  const height = PREVIEW_SIZE + CAPTION_HEIGHT;
  const fitsRight = hover.x + GAP + width + EDGE <= window.innerWidth;
  const left = fitsRight ? hover.x + GAP : Math.max(EDGE, hover.x - GAP - width);
  const fitsBelow = hover.rowBottom + ROW_GAP + height + EDGE <= window.innerHeight;
  const top = fitsBelow ? hover.rowBottom + ROW_GAP : Math.max(EDGE, hover.rowTop - ROW_GAP - height);
  return (
    // Only on screens wide enough to have a mouse.
    <div
      className="pointer-events-none fixed z-30 hidden flex-col rounded-lg border border-neutral-200 bg-white p-2 shadow-lg lg:flex"
      style={{ left, top, width, height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="min-h-0 w-full flex-1 object-contain" />
      <p className="mt-1.5 truncate text-center text-xs text-neutral-700">{caption}</p>
    </div>
  );
}
