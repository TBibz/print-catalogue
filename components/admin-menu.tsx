"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/admin/models", label: "Models" },
  { href: "/admin/materials", label: "Materials" },
  { href: "/admin/printers", label: "Printers" },
  { href: "/admin/settings", label: "Settings" },
];

// The "Admin ▾" drop-down in the header. Closes when a link is chosen, on a
// click anywhere else, or with Esc.
export function AdminMenu({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        Admin <span aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="absolute left-0 z-40 mt-1 min-w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
