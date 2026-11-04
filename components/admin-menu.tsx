"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The admin-only pages: the everyday ones in the header, the rest under
// "Setup ▾".
const ADMIN_LINKS = [
  { href: "/admin/queue", label: "Queue" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/models", label: "Models" },
];
const SETUP_LINKS = [
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/upload", label: "Upload" },
  { href: "/admin/materials", label: "Materials" },
  { href: "/admin/printers", label: "Printers" },
  { href: "/admin/settings", label: "Settings" },
];

const navLink = "rounded-md px-2.5 py-1.5 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900";
const currentLink = "rounded-md px-2.5 py-1.5 bg-neutral-100 font-medium text-neutral-900";

const isCurrent = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

// A header link that's highlighted on its own page.
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = isCurrent(pathname, href);
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={current ? currentLink : navLink}>
      {children}
    </Link>
  );
}

// The admin links: Queue, Jobs, Reports, Models, then "Setup ▾".
export function AdminNav() {
  return (
    <>
      {ADMIN_LINKS.map((l) => (
        <NavLink key={l.href} href={l.href}>
          {l.label}
        </NavLink>
      ))}
      <SetupMenu />
    </>
  );
}

// The "Setup ▾" drop-down (Categories, Upload, Materials, Printers,
// Settings). Highlighted while on any of those pages. Closes when a link is
// chosen, on a click anywhere else, or with Esc.
function SetupMenu() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const inSetup = SETUP_LINKS.some((l) => isCurrent(pathname, l.href));

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
        className={inSetup ? currentLink : navLink}
      >
        Setup <span aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="absolute left-0 z-40 mt-1 min-w-44 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {SETUP_LINKS.map((l) => {
            const current = isCurrent(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2.5 text-sm hover:bg-neutral-100 hover:text-neutral-900 ${
                    current ? "font-medium text-neutral-900" : "text-neutral-700"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
