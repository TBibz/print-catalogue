// The invoice as an A4 PDF, made on the server with @react-pdf/renderer (no
// headless browser, so it works on Vercel). It uses the same measurements
// as the on-screen sheet (lib/invoice-layout.ts).
//
// Long invoices flow onto more pages: the table header repeats (`fixed`) and
// every page says "Page X of Y" at the bottom.
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { COLOURS, COLUMNS, FONT, PAGE, ROW, type ColumnKey } from "@/lib/invoice-layout";
import { formatMoney } from "@/lib/money";
import {
  formatInvoiceDate,
  linesTotals,
  type Company,
  type Invoice,
  type InvoiceLine,
} from "@/lib/invoices";

// Break long names only between words, never hyphenate them ("wrap-ping").
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: {
    paddingTop: PAGE.marginTop,
    paddingBottom: PAGE.marginBottom,
    paddingHorizontal: PAGE.marginX,
    fontFamily: "Helvetica",
    fontSize: FONT.body,
    color: COLOURS.text,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  company: { fontFamily: "Helvetica-Bold", fontSize: FONT.company, maxWidth: 300 },
  contact: { fontSize: FONT.contact, color: COLOURS.muted, textAlign: "right", lineHeight: 1.4 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 28 },
  metaBlock: { flexDirection: "row", gap: 28 },
  label: { fontSize: FONT.label, color: COLOURS.muted, letterSpacing: 0.6, marginBottom: 3 },
  value: { fontFamily: "Helvetica-Bold", fontSize: FONT.value },
  totalBox: {
    backgroundColor: COLOURS.totalBg,
    color: COLOURS.totalText,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "flex-end",
    minWidth: 150,
  },
  totalLabel: { fontSize: FONT.totalLabel, letterSpacing: 0.8, marginBottom: 2 },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: FONT.total },
  table: { marginTop: 24 },
  headRow: { flexDirection: "row", backgroundColor: COLOURS.headerBg, color: COLOURS.headerText },
  headCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: FONT.label,
    letterSpacing: 0.5,
    paddingVertical: ROW.headerPadY,
    paddingHorizontal: ROW.padX,
  },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLOURS.line },
  cell: { paddingVertical: ROW.padY, paddingHorizontal: ROW.padX },
  footer: {
    position: "absolute",
    bottom: 24,
    left: PAGE.marginX,
    right: PAGE.marginX,
    fontSize: FONT.footer,
    color: COLOURS.muted,
    textAlign: "center",
  },
  watermark: {
    position: "absolute",
    top: 330,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 120,
    color: COLOURS.watermark,
    opacity: 0.35,
    transform: "rotate(-30deg)",
  },
});

const tableWidth = PAGE.width - PAGE.marginX * 2;
const colStyle = (key: ColumnKey) => {
  const c = COLUMNS.find((col) => col.key === key)!;
  return { width: tableWidth * c.width, textAlign: c.align } as const;
};

function cellText(line: InvoiceLine, key: ColumnKey) {
  switch (key) {
    case "code":
      return line.code ?? "";
    case "item":
      return line.description;
    case "amount":
      return String(line.quantity);
    case "each":
      return line.unit_price === null ? "No price" : formatMoney(line.unit_price);
    case "total":
      return line.unit_price === null ? "—" : formatMoney(line.quantity * line.unit_price);
  }
}

export function InvoiceDocument({
  invoice,
  lines,
  company,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  company: Company;
}) {
  const draft = invoice.status !== "finalised";
  const { total } = linesTotals(lines);
  return (
    <Document title={`${invoice.number ?? "Draft"} ${company.name}`} author={company.name}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <Text style={s.company}>{company.name}</Text>
          <View>
            {company.addressLines.map((l) => (
              <Text key={l} style={s.contact}>
                {l}
              </Text>
            ))}
            {company.phone && <Text style={s.contact}>Tel: {company.phone}</Text>}
            {company.email && <Text style={s.contact}>{company.email}</Text>}
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaBlock}>
            <View>
              <Text style={s.label}>INVOICE NUMBER</Text>
              <Text style={s.value}>{invoice.number ?? "DRAFT"}</Text>
            </View>
            <View>
              <Text style={s.label}>INVOICE DATE</Text>
              <Text style={s.value}>{formatInvoiceDate(invoice.invoice_date)}</Text>
            </View>
            {/* A "Bill to" block can go here later. */}
          </View>
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>GRAND TOTAL</Text>
            <Text style={s.totalValue}>{formatMoney(total)}</Text>
          </View>
        </View>

        <View style={s.table}>
          {/* `fixed`: repeated at the top of every page the table flows onto. */}
          <View style={s.headRow} fixed>
            {COLUMNS.map((c) => (
              <Text key={c.key} style={[s.headCell, colStyle(c.key)]}>
                {c.label}
              </Text>
            ))}
          </View>
          {lines.map((line, i) => (
            <View
              key={line.id}
              style={[s.row, { backgroundColor: i % 2 === 1 ? COLOURS.zebra : "#ffffff" }]}
              wrap={false}
            >
              {COLUMNS.map((c) => (
                <Text key={c.key} style={[s.cell, colStyle(c.key)]}>
                  {cellText(line, c.key)}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />

        {/* Over everything (faint, so the lines still read), on every page,
            while it's a draft. */}
        {draft && (
          <Text style={s.watermark} fixed>
            DRAFT
          </Text>
        )}
      </Page>
    </Document>
  );
}
