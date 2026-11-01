// Invoice pages (list, builder, draft and finalised invoice) are at most
// 1000px wide, so the eye and mouse don't travel across the whole screen.
export default function InvoicesLayout({ children }: LayoutProps<"/invoices">) {
  return <div className="max-w-[62.5rem]">{children}</div>;
}
