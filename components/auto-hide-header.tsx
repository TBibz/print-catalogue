"use client";

// The site header stays at the top of the screen, but slides away while you
// scroll down and slides back as soon as you scroll up (or reach the top).
//
// It also keeps the CSS variable --nav-offset up to date: the header's
// height while it's showing, 0 while it's hidden. Sticky things further
// down (the catalogue's column headings and category sidebar, the queue's
// headings) use it as their `top`, so they sit right under the header and
// move up with it, using the same transition.
import { useEffect, useRef, useState } from "react";

const DOWN_THRESHOLD = 6; // px of scrolling down before it hides
const UP_THRESHOLD = 2; // px of scrolling up before it shows again

export function AutoHideHeader({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const root = document.documentElement;
    let height = header.offsetHeight;
    let lastY = window.scrollY;
    let isHidden = false;
    let frame = 0;

    const apply = (hide: boolean) => {
      isHidden = hide;
      setHidden(hide);
      root.style.setProperty("--nav-offset", hide ? "0px" : `${height}px`);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y <= height) {
          // At (or near) the top: always show.
          if (isHidden) apply(false);
        } else if (y > lastY + DOWN_THRESHOLD) {
          if (!isHidden) apply(true);
        } else if (y < lastY - UP_THRESHOLD) {
          if (isHidden) apply(false);
        } else {
          return; // tiny movement: keep lastY so small steps add up
        }
        lastY = y;
      });
    };

    // The header can change height (e.g. links wrapping on a narrow screen).
    const resize = new ResizeObserver(() => {
      height = header.offsetHeight;
      if (!isHidden) root.style.setProperty("--nav-offset", `${height}px`);
    });
    resize.observe(header);
    apply(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      resize.disconnect();
      cancelAnimationFrame(frame);
      root.style.setProperty("--nav-offset", "0px");
    };
  }, []);

  return (
    <header
      ref={ref}
      // Sliding with transform doesn't change the page layout, so nothing jumps.
      className={`sticky top-0 z-40 border-b border-neutral-200 bg-white transition-transform duration-200 ease-out ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {children}
    </header>
  );
}
