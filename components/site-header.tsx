import Link from "next/link";
import { signOut } from "@/app/actions/auth";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/catalogue" className="text-lg font-semibold">
          Print Catalogue
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm">
          <Link
            href="/catalogue"
            className="rounded-md px-2 py-1.5 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
          >
            Catalogue
          </Link>
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
