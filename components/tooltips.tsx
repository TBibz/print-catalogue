"use client";

// The app's hover tooltips. An element opts in with data-tip="text" instead
// of the browser's own title="…", whose native tooltip some browsers draw in
// the wrong place (e.g. stuck in the top-left corner). This one is placed
// from the hovered element's position on screen, so it always sits next to
// it, and it goes away as soon as the mouse leaves, the page scrolls, or
// anything is clicked or typed.
//
// One listener for the whole page (mounted once in the app layout), so long
// lists like the catalogue cost nothing extra.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DELAY = 350; // ms the pointer rests before the tooltip shows
const GAP = 6; // px between the element and the tooltip
const EDGE = 8; // px kept clear of the window's edges

type Tip = { text: string; left: number; top: number; above: boolean };

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: number | undefined;

    function hide() {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    }

    function show(el: HTMLElement) {
      const text = el.dataset.tip;
      const r = el.getBoundingClientRect();
      // Gone from the page, or hidden: nothing to point at.
      if (!text || !el.isConnected || (r.width === 0 && r.height === 0)) return;
      // Below the element, unless that would go off the bottom of the window.
      const above = r.bottom + GAP + 40 > window.innerHeight;
      setTip({ text, left: r.left, top: above ? r.top - GAP : r.bottom + GAP, above });
    }

    function over(e: PointerEvent) {
      if (e.pointerType === "touch") return; // no hovering on a touch screen
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-tip]") ?? null;
      if (el === current) return;
      hide();
      if (!el?.dataset.tip) return;
      current = el;
      timer = window.setTimeout(() => {
        if (current === el) show(el);
      }, DELAY);
    }

    // The pointer left the window altogether.
    function out(e: PointerEvent) {
      if (!e.relatedTarget) hide();
    }

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Keep it inside the window: nudge it left if it would run off the right.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!el || !tip) return;
    const maxLeft = window.innerWidth - el.offsetWidth - EDGE;
    el.style.left = `${Math.max(EDGE, Math.min(tip.left, maxLeft))}px`;
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      role="tooltip"
      style={{
        left: tip.left,
        top: tip.top,
        transform: tip.above ? "translateY(-100%)" : undefined,
      }}
      className="pointer-events-none fixed z-[100] max-w-xs rounded-md bg-neutral-900 px-2 py-1 text-xs leading-snug whitespace-pre-line text-white shadow-lg"
    >
      {tip.text}
    </div>
  );
}
