// Shared layout for every logged-in page (the "(app)" folder name doesn't
// appear in the URL). The login page sits outside it, so it has no header.
import { SiteHeader } from "@/components/site-header";
import { Tooltips } from "@/components/tooltips";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      <Tooltips />
    </>
  );
}
