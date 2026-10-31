import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { getCurrentProfile } from "@/lib/auth";

const navLink =
  "rounded-md px-2 py-1.5 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/catalogue" className="text-lg font-semibold">
          Print Catalogue
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:gap-x-4">
          <Link href="/catalogue" className={navLink}>
            Catalogue
          </Link>
          <Link href="/notepad" className={navLink}>
            Notepad
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
    <>
      <Link href="/admin/queue" className={navLink}>
        Queue
      </Link>
      <Link href="/admin/models" className={navLink}>
        Models
      </Link>
    </>
  );
}
