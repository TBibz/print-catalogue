import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { getCurrentProfile } from "@/lib/auth";

const navLink =
  "rounded-md px-2 py-1.5 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/catalogue" className="text-lg font-semibold">
          Print Catalogue
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm">
          <Link href="/catalogue" className={navLink}>
            Catalogue
          </Link>
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
  return (
    <Link href="/admin/queue" className={navLink}>
      Queue
    </Link>
  );
}
