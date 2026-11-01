// Invoice pages (list, builder, draft and finalised invoice) are at most
// 1000px wide and centred, so the eye and mouse don't travel across the
// whole screen. Everything on the page (back link, title, table, bottom
// bar) lines up with this block's left edge.
export default function InvoicesLayout({ children }: LayoutProps<"/invoices">) {
  return <div className="mx-auto max-w-[62.5rem]">{children}</div>;
}
