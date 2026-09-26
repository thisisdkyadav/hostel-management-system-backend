/**
 * Accountant export of invoiced accommodation payments as an Excel XML sheet.
 */

import { listSettledPayments } from "./accommodation.invoice-pdf.js"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const sheetDate = (value) => {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}

const money = (n) =>
  (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FORMULA_LEAD = new Set(["=", "+", "-", "@", "\t", "\r"])

const cellText = (value) => {
  const text = value == null ? "" : String(value)
  const guarded = text && FORMULA_LEAD.has(text[0]) ? `'${text}` : text
  return guarded
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

const HEADERS = ["Student name", "Email", "Stay period", "Amount", "UTR", "Date of payment"]

export const invoiceExportRows = (requests = []) => {
  const rows = []
  for (const request of requests) {
    const stay = request?.stay || {}
    const period = [sheetDate(stay.fromDate), sheetDate(stay.toDate)].filter(Boolean).join(" to ")
    const payments = listSettledPayments(request)
    const lines = payments.length
      ? payments
      : [{ amount: request?.payment?.amount || request?.quote?.total || 0, utr: request?.payment?.utr || "", paidAt: request?.payment?.paidAt || null }]
    for (const pay of lines) {
      rows.push([
        request.applicantName || "",
        request.applicantEmail || "",
        period,
        money(pay.amount),
        pay.utr || "",
        sheetDate(pay.paidAt),
      ])
    }
  }
  return rows
}

export const buildInvoiceExportExcel = ({ fromLabel, toLabel, rows = [] } = {}) => {
  const header = `<Row>${HEADERS.map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${cellText(h)}</Data></Cell>`).join("")}</Row>`
  const body = rows
    .map(
      (row) =>
        `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${cellText(cell)}</Data></Cell>`).join("")}</Row>`
    )
    .join("\n")
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default"><Alignment ss:Vertical="Center"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8F1FE" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="Invoices">
    <Table>
      ${header}
      ${body}
    </Table>
  </Worksheet>
</Workbook>`
  const filename = `accommodation-invoices-${fromLabel}-to-${toLabel}.xls`
  return { xml, filename, contentType: "application/vnd.ms-excel;charset=utf-8" }
}

export default { invoiceExportRows, buildInvoiceExportExcel }
