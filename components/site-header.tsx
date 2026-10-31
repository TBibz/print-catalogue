import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { AdminNav, NavLink } from "@/components/admin-menu";
import { getCurrentProfile } from "@/lib/auth";

// App name (goes to the catalogue), Notepad, the admin links (admin only),
// and Sign out on the right.
export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex min-h-14 w-full max-w-[96rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/catalogue" className="text-lg font-semibold">
          Print Catalogue
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1 text-sm">
          <NavLink href="/notepad">Notepad</NavLink>
          {/* Checking the role needs the login cookie, so it streams in. */}
          <Suspense fallback={null}>
            <AdminLinks />
          </Suspense>
        </nav>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

// Links only the admin sees.
async function AdminLinks() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return null;
  return <AdminNav />;
}
