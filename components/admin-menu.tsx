"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getUntickedNoteCount } from "@/app/actions/notepad";
import { setNotepadCount, useNotepadCount } from "@/lib/notepad-count";

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
// The current page: the "Navbar highlight" colour (Settings → Colours) with
// bold text, white or dark to suit it.
const currentLink =
  "rounded-md px-2.5 py-1.5 bg-[var(--colour-nav-highlight)] font-bold text-[var(--colour-nav-highlight-text)]";

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

// "Notepad (2)": how many notepad lines aren't ticked off yet (just
// "Notepad" when there are none). Asked of the database on every page change
// and when coming back to the tab; the notepad page updates it straight away
// as lines change (lib/notepad-count.ts).
export function NotepadNavLink() {
  const pathname = usePathname();
  const count = useNotepadCount();

  useEffect(() => {
    let current = true;
    const refresh = () =>
      void getUntickedNoteCount().then((n) => {
        if (current && n !== null) setNotepadCount(n);
      });
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return <NavLink href="/notepad">{count ? `Notepad (${count})` : "Notepad"}</NavLink>;
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
                  className={`block px-4 py-2.5 text-sm ${
                    current
                      ? "bg-[var(--colour-nav-highlight)] font-bold text-[var(--colour-nav-highlight-text)]"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
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
