// The invoice as it looks on screen: the same A4 layout and measurements
// as the PDF (lib/invoice-layout.ts, in points), so what you see is what
// gets downloaded or emailed. Drafts pass their own cells (boxes to type
// in) and actions; finalised invoices just show text.
import type { ReactNode } from "react";
import { COLOURS, COLUMNS, FONT, PAGE, ROW, type ColumnKey } from "@/lib/invoice-layout";
import { formatMoney } from "@/lib/money";
import type { Company, InvoiceLine } from "@/lib/invoices";

const pt = (n: number) => `${n}pt`;

export function plainCell(line: InvoiceLine, key: ColumnKey): ReactNode {
  switch (key) {
    case "code":
      return line.code ?? "";
    case "item":
      return line.description;
    case "amount":
      return line.quantity;
    case "each":
      return line.unit_price === null ? <span style={{ color: COLOURS.muted }}>No price</span> : formatMoney(line.unit_price);
    case "total":
      return line.unit_price === null ? "—" : formatMoney(line.quantity * line.unit_price);
  }
}

export function InvoiceSheet({
  company,
  numberText,
  dateSlot,
  total,
  lines,
  cell = plainCell,
  rowAction,
  afterTable,
  draft,
}: {
  company: Company;
  numberText: string; // "INV-0001" or "DRAFT"
  dateSlot: ReactNode; // the date, or a date box on drafts
  total: number;
  lines: InvoiceLine[];
  cell?: (line: InvoiceLine, key: ColumnKey) => ReactNode;
  rowAction?: (line: InvoiceLine) => ReactNode; // e.g. a remove button
  afterTable?: ReactNode; // e.g. "+ Add model" on drafts
  draft: boolean;
}) {
  return (
    // Wider than a phone: it scrolls sideways there rather than squashing.
    <div className="overflow-x-auto">
      <div
        className="relative mx-auto bg-white shadow-[0_1px_8px_rgba(0,0,0,0.12)] ring-1 ring-neutral-200"
        style={{
          width: pt(PAGE.width),
          minHeight: pt(PAGE.height),
          padding: `${pt(PAGE.marginTop)} ${pt(PAGE.marginX)} ${pt(PAGE.marginBottom)}`,
          fontSize: pt(FONT.body),
          color: COLOURS.text,
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        {draft && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 text-center font-bold select-none"
            style={{
              top: pt(330),
              fontSize: pt(120),
              color: COLOURS.watermark,
              opacity: 0.35,
              transform: "rotate(-30deg)",
            }}
          >
            DRAFT
          </div>
        )}

        <div className="flex items-start justify-between gap-6">
          <div className="font-bold" style={{ fontSize: pt(FONT.company), lineHeight: 1.15, maxWidth: pt(300) }}>
            {company.name}
          </div>
          <div className="text-right" style={{ fontSize: pt(FONT.contact), color: COLOURS.muted, lineHeight: 1.4 }}>
            {company.addressLines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            {company.phone && <div>Tel: {company.phone}</div>}
            {company.email && <div>{company.email}</div>}
          </div>
        </div>

        <div className="flex items-end justify-between gap-6" style={{ marginTop: pt(28) }}>
          <div className="flex flex-wrap" style={{ gap: pt(28) }}>
            <div>
              <div style={{ fontSize: pt(FONT.label), color: COLOURS.muted, letterSpacing: "0.06em", marginBottom: pt(3) }}>
                INVOICE NUMBER
              </div>
              <div className="font-bold" style={{ fontSize: pt(FONT.value) }}>
                {numberText}
              </div>
            </div>
            <div>
              <div style={{ fontSize: pt(FONT.label), color: COLOURS.muted, letterSpacing: "0.06em", marginBottom: pt(3) }}>
                INVOICE DATE
              </div>
              <div className="font-bold" style={{ fontSize: pt(FONT.value) }}>
                {dateSlot}
              </div>
            </div>
            {/* A "Bill to" block can go here later. */}
          </div>
          <div
            className="text-right"
            style={{
              background: COLOURS.totalBg,
              color: COLOURS.totalText,
              padding: `${pt(8)} ${pt(14)}`,
              minWidth: pt(150),
            }}
          >
            <div style={{ fontSize: pt(FONT.totalLabel), letterSpacing: "0.08em", marginBottom: pt(2) }}>GRAND TOTAL</div>
            <div className="font-bold tabular-nums" style={{ fontSize: pt(FONT.total) }}>
              {formatMoney(total)}
            </div>
          </div>
        </div>

        <table className="w-full border-collapse" style={{ marginTop: pt(24), tableLayout: "fixed" }}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: `${c.width * 100}%` }} />
            ))}
            {rowAction && <col style={{ width: pt(26) }} />}
          </colgroup>
          <thead>
            <tr style={{ background: COLOURS.headerBg, color: COLOURS.headerText }}>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="font-bold"
                  style={{
                    fontSize: pt(FONT.label),
                    letterSpacing: "0.05em",
                    padding: `${pt(ROW.headerPadY)} ${pt(ROW.padX)}`,
                    textAlign: c.align,
                  }}
                >
                  {c.label}
                </th>
              ))}
              {rowAction && (
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={line.id}
                style={{
                  background: i % 2 === 1 ? COLOURS.zebra : undefined,
                  borderBottom: `0.5pt solid ${COLOURS.line}`,
                }}
              >
                {COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className="align-middle tabular-nums"
                    style={{ padding: `${pt(ROW.padY)} ${pt(ROW.padX)}`, textAlign: c.align }}
                  >
                    {cell(line, c.key)}
                  </td>
                ))}
                {rowAction && <td className="text-center align-middle">{rowAction(line)}</td>}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + (rowAction ? 1 : 0)} className="py-6 text-center" style={{ color: COLOURS.muted }}>
                  No lines yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {afterTable}
      </div>
    </div>
  );
}
