/**
 * HCU accommodation invoice PDF.
 *
 * Reproduces the Hostel Coordination Unit invoice sheet (backend/docs/HCU-invoice-format.pdf):
 * bilingual letterhead with the institute logo, GST number, invoice no./date, the
 * "TO WHOM IT MAY CONCERN" declaration, the guest charge table with its
 * Amount-in-Words / Grand Total and UTR footer rows, an authorised-signatory
 * line, and the Payment Details block.
 *
 * The Hindi lines need a Devanagari face — the PDF base-14 fonts are Latin-only.
 * Noto Sans Devanagari (OFL) ships with @fontsource; pdfkit shapes it through
 * fontkit, so conjuncts and matras come out correctly.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import PDFDocument from "pdfkit"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(HERE, "../../../../..")

const ASSET = {
  logo: path.join(BACKEND_ROOT, "src/assets/iiti-logo.png"),
  devanagari: path.join(
    BACKEND_ROOT,
    "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff"
  ),
}

// Matches the source sheet: navy letterhead, hairline rules, amber data rows.
const INK = "#1f3864"
const LINE = "#000000"
const ROW_FILL = "#fde9c9"

const PAGE_MARGIN = 36
const PAGE_WIDTH = 595.28 // A4 portrait
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2

// Charge-table column widths, in the order the source sheet lays them out.
// They sum to CONTENT_WIDTH (523pt) so the table spans the full text block.
const COLUMNS = [
  { key: "guests", header: "No. of\nGuests", width: 42, align: "center" },
  { key: "details", header: "Guest Details", width: 106, align: "left" },
  { key: "hostel", header: "Hostel", width: 60, align: "center" },
  { key: "from", header: "From", width: 56, align: "center" },
  { key: "to", header: "To", width: 56, align: "center" },
  { key: "days", header: "No. of Days/Month", width: 52, align: "center" },
  { key: "tariff", header: "Tariff per Day/Month", width: 55, align: "center" },
  { key: "gst", header: "GST", width: 41, align: "center" },
  { key: "total", header: "Total Amount\nRs.", width: 55, align: "center" },
]

// The Devanagari webfont is a script subset — it has no Latin digits or
// punctuation, so a mixed line like "…इंदौर – 453552, भारत" has to be drawn as
// alternating runs, each in the font that actually carries those glyphs.
const DEVANAGARI_RE = /[ऀ-ॿ‌‍]/

const splitScriptRuns = (text) => {
  const runs = []
  for (const ch of String(text)) {
    const deva = DEVANAGARI_RE.test(ch)
    const last = runs[runs.length - 1]
    if (last && last.deva === deva) last.text += ch
    else runs.push({ deva, text: ch })
  }
  return runs
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`)

/** Indian numbering: crore / lakh / thousand / hundred. */
const numberToWords = (value) => {
  const n = Math.floor(Math.abs(Number(value) || 0))
  if (n === 0) return "Zero"
  const parts = []
  const push = (count, label) => { if (count) parts.push(`${twoDigits(count)} ${label}`) }
  push(Math.floor(n / 10000000), "Crore")
  push(Math.floor((n % 10000000) / 100000), "Lakh")
  push(Math.floor((n % 100000) / 1000), "Thousand")
  push(Math.floor((n % 1000) / 100), "Hundred")
  const rest = n % 100
  if (rest) parts.push(twoDigits(rest))
  return parts.join(" ")
}

/** "Rupees One Thousand One Hundred Twenty and Fifty Paise Only" */
export const amountInWords = (value) => {
  const amount = Math.abs(Number(value) || 0)
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  const head = `Rupees ${numberToWords(rupees)}`
  return paise > 0 ? `${head} and ${numberToWords(paise)} Paise Only` : `${head} Only`
}

const money = (n) =>
  `${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "1-Jan-2026", the format the sheet uses. */
const sheetDate = (value) => {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`
}

/** Indian financial year label, e.g. 2026-04-02 -> "26-27". */
const financialYear = (value) => {
  const d = value ? new Date(value) : new Date()
  const base = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${String(base).slice(-2)}-${String(base + 1).slice(-2)}`
}

/** Invoice number in the sheet's shape: HCU/ACC/<FY>/<serial>. */
export const buildInvoiceNumber = ({ serial, date } = {}) =>
  `HCU/ACC/${financialYear(date)}/${serial ?? 0}`

const hasDevanagari = fs.existsSync(ASSET.devanagari)

// ---- drawing primitives -------------------------------------------------

const box = (doc, x, y, w, h, { fill } = {}) => {
  if (fill) doc.rect(x, y, w, h).fill(fill)
  doc.rect(x, y, w, h).lineWidth(0.7).stroke(LINE)
}

/**
 * Text vertically centred in a cell, clipped to it. Returns nothing — callers
 * lay the grid out themselves, because the sheet is a fixed form, not flow.
 */
/**
 * One centred line that may mix Devanagari and Latin, each run drawn in the
 * font that has the glyphs. Latin runs are nudged down slightly so the two
 * faces sit on a shared baseline.
 */
const mixedScriptLine = (doc, text, x, y, width, { devaSize, latinSize, color = INK }) => {
  const runs = splitScriptRuns(text)
  let total = 0
  for (const run of runs) {
    doc.font(run.deva ? "Devanagari" : "Helvetica-Bold").fontSize(run.deva ? devaSize : latinSize)
    run.width = doc.widthOfString(run.text)
    total += run.width
  }

  let cursor = x + (width - total) / 2
  doc.fillColor(color)
  for (const run of runs) {
    doc.font(run.deva ? "Devanagari" : "Helvetica-Bold").fontSize(run.deva ? devaSize : latinSize)
    doc.text(run.text, cursor, run.deva ? y : y + (devaSize - latinSize) / 2 + 1, { lineBreak: false })
    cursor += run.width
  }
}

const cellText = (doc, text, x, y, w, h, { align = "center", size = 7.5, bold = false, color = "#000" } = {}) => {
  const value = String(text ?? "")
  if (!value) return
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color)
  const padX = 3
  const height = doc.heightOfString(value, { width: w - padX * 2, align })
  doc.text(value, x + padX, y + Math.max(2, (h - height) / 2), { width: w - padX * 2, align, lineGap: 0 })
}

// ---- sections -----------------------------------------------------------

const drawLetterhead = (doc, { gstin }) => {
  const top = PAGE_MARGIN
  if (fs.existsSync(ASSET.logo)) {
    doc.image(ASSET.logo, PAGE_MARGIN + 4, top + 6, { fit: [96, 46] })
  }

  const textX = PAGE_MARGIN + 110
  const textW = CONTENT_WIDTH - 110
  let y = top

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11)
  doc.text("Hostel Coordination Unit (HCU)", textX, y, { width: textW, align: "center" })
  y += 13

  if (hasDevanagari) {
    mixedScriptLine(doc, "भारतीय प्रौद्योगिकी संस्थान इंदौर", textX, y, textW, { devaSize: 10, latinSize: 9.5 })
    y += 14
    mixedScriptLine(doc, "खंडवा रोड, सिमरोल, इंदौर – 453552, भारत", textX, y, textW, { devaSize: 9, latinSize: 8.5 })
    y += 14
  }

  doc.font("Helvetica-Bold").fontSize(10.5)
  doc.text("Indian Institute of Technology Indore", textX, y, { width: textW, align: "center" })
  y += 12
  doc.fontSize(9.5)
  doc.text("Khandwa Road, Simrol, Indore – 453552, India", textX, y, { width: textW, align: "center" })
  y += 16

  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).lineWidth(1).stroke(LINE)
  y += 5

  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000")
  doc.text(`GST. No. ${gstin || ""}`, PAGE_MARGIN, y, { width: CONTENT_WIDTH, align: "right" })
  return y + 12
}

const drawInvoiceMeta = (doc, y, { invoiceNumber, invoiceDate }) => {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000")
  doc.text("Inv No.", PAGE_MARGIN + 4, y)
  doc.text(invoiceNumber, PAGE_MARGIN + 50, y)
  doc.text("Date", PAGE_MARGIN + 340, y)
  doc.text(sheetDate(invoiceDate), PAGE_MARGIN + 420, y)
  return y + 22
}

const drawDeclaration = (doc, y, { total }) => {
  const heading = "TO WHOM IT MAY CONCERN"
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000")
  const headingWidth = doc.widthOfString(heading)
  const headingX = PAGE_MARGIN + (CONTENT_WIDTH - headingWidth) / 2
  doc.text(heading, headingX, y)
  doc.moveTo(headingX, y + 10).lineTo(headingX + headingWidth, y + 10).lineWidth(0.7).stroke(LINE)
  y += 22

  doc.font("Helvetica-Bold").fontSize(7.5)
  doc.text(
    `Your accommodation charges are Rs. ${money(total)}/- (${amountInWords(total)}). ` +
      "Regarding Hostel accommodation charges, please see the details below.",
    PAGE_MARGIN, y, { width: CONTENT_WIDTH, align: "left", lineGap: 1 }
  )
  return y + 24
}

const drawChargeTable = (doc, y, { rows, total, utr }) => {
  const headerHeight = 24
  const rowHeight = 22
  const xs = []
  let cursor = PAGE_MARGIN
  for (const col of COLUMNS) {
    xs.push(cursor)
    cursor += col.width
  }
  const tableWidth = cursor - PAGE_MARGIN

  COLUMNS.forEach((col, i) => {
    box(doc, xs[i], y, col.width, headerHeight)
    cellText(doc, col.header, xs[i], y, col.width, headerHeight, { bold: true, size: 6.8 })
  })
  y += headerHeight

  // The sheet always shows three body rows and tints the first two, whether or
  // not they carry an entry — that shape is part of the form.
  const bodyRows = 3
  const tintedRows = 2
  for (let r = 0; r < bodyRows; r += 1) {
    const data = rows[r]
    COLUMNS.forEach((col, i) => {
      box(doc, xs[i], y, col.width, rowHeight, { fill: r < tintedRows ? ROW_FILL : undefined })
      if (data) cellText(doc, data[col.key], xs[i], y, col.width, rowHeight, { align: col.align, size: 7 })
    })
    y += rowHeight
  }

  // "Amount in Words" | words | "Grand Total" | value
  const labelWidth = COLUMNS[0].width + COLUMNS[1].width
  const grandLabelWidth = COLUMNS[7].width
  const grandValueWidth = COLUMNS[8].width
  const wordsWidth = tableWidth - labelWidth - grandLabelWidth - grandValueWidth
  const footRow = 24

  box(doc, PAGE_MARGIN, y, labelWidth, footRow)
  cellText(doc, "Amount in Words", PAGE_MARGIN, y, labelWidth, footRow, { bold: true, size: 7.5 })
  box(doc, PAGE_MARGIN + labelWidth, y, wordsWidth, footRow)
  cellText(doc, amountInWords(total), PAGE_MARGIN + labelWidth, y, wordsWidth, footRow, { size: 7.5 })
  box(doc, PAGE_MARGIN + labelWidth + wordsWidth, y, grandLabelWidth, footRow)
  cellText(doc, "Grand Total", PAGE_MARGIN + labelWidth + wordsWidth, y, grandLabelWidth, footRow, { bold: true, size: 7.5 })
  const grandValueX = PAGE_MARGIN + labelWidth + wordsWidth + grandLabelWidth
  box(doc, grandValueX, y, grandValueWidth, footRow)
  // "₹ 3,360.00" — the rupee sign is not in WinAnsi, so it comes from the
  // Devanagari face (which carries it) while the figure stays in Helvetica.
  if (hasDevanagari) {
    doc.font("Devanagari").fontSize(7.5)
    const signWidth = doc.widthOfString("₹")
    doc.font("Helvetica-Bold").fontSize(7.5)
    const figure = money(total)
    const figureWidth = doc.widthOfString(figure)
    const gap = 2
    let cursor = grandValueX + (grandValueWidth - (signWidth + gap + figureWidth)) / 2
    doc.fillColor("#000").font("Devanagari").fontSize(7.5)
    doc.text("₹", cursor, y + (footRow - 9) / 2, { lineBreak: false })
    cursor += signWidth + gap
    doc.font("Helvetica-Bold").fontSize(7.5)
    doc.text(figure, cursor, y + (footRow - 8) / 2, { lineBreak: false })
  } else {
    cellText(doc, money(total), grandValueX, y, grandValueWidth, footRow, { bold: true, size: 7.5 })
  }
  y += footRow

  box(doc, PAGE_MARGIN, y, labelWidth, footRow)
  cellText(doc, "Payment Transaction ID", PAGE_MARGIN, y, labelWidth, footRow, { bold: true, size: 7.5 })
  const utrWidth = tableWidth - labelWidth
  box(doc, PAGE_MARGIN + labelWidth, y, utrWidth, footRow)
  cellText(doc, utr || "", PAGE_MARGIN + labelWidth, y, utrWidth, footRow, { size: 7.5 })
  y += footRow

  return y
}

const drawSignatory = (doc, y) => {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000")
  doc.text("Authorized Signatory", PAGE_MARGIN, y + 96, { width: CONTENT_WIDTH, align: "right" })
  return y + 96 + 24
}

const drawPaymentDetails = (doc, y, { requestedBy, purpose, source }) => {
  const rowHeight = 22
  const labelWidth = 168
  const valueWidth = CONTENT_WIDTH - labelWidth

  box(doc, PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight)
  cellText(doc, "Payment Details", PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight, { bold: true, size: 8.5 })
  y += rowHeight

  const lines = [
    ["Unit Requested By", requestedBy],
    ["Purpose", purpose],
    ["Source of Payment", source || "Self"],
  ]
  for (const [label, value] of lines) {
    box(doc, PAGE_MARGIN, y, labelWidth, rowHeight)
    cellText(doc, label, PAGE_MARGIN, y, labelWidth, rowHeight, { bold: true, align: "left", size: 8 })
    box(doc, PAGE_MARGIN + labelWidth, y, valueWidth, rowHeight)
    cellText(doc, value, PAGE_MARGIN + labelWidth, y, valueWidth, rowHeight, { align: "left", size: 8 })
    y += rowHeight
  }

  // Trailing blank band, as on the source sheet.
  box(doc, PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight * 1.6)
  return y + rowHeight * 1.6
}

/** Standard computer-generated invoice disclaimer (footer). */
const drawComputerGeneratedNote = (doc, y) => {
  const top = Math.max(y + 18, doc.page.height - PAGE_MARGIN - 28)
  doc
    .font("Helvetica-Oblique")
    .fontSize(7.5)
    .fillColor("#444")
    .text(
      "This is a computer-generated invoice and does not require a physical signature.",
      PAGE_MARGIN,
      top,
      { width: CONTENT_WIDTH, align: "center" }
    )
  return top + 14
}

// ---- public API ---------------------------------------------------------

/**
 * Flatten an AccommodationRequest into the sheet's fields.
 * `hostelName` is resolved by the caller (allotment stores only the id).
 */
export const buildInvoiceModel = ({ request, hostelName = "", gstin = "", studentName = "" } = {}) => {
  const quote = request?.quote || {}
  const stay = request?.stay || {}
  const guests = Array.isArray(request?.guests) ? request.guests : []
  const guestCharges = Array.isArray(quote.guestCharges) ? quote.guestCharges : []
  const total = Number(request?.payment?.amount) || Number(quote.total) || 0
  const nights = String(request?.nights ?? quote.nights ?? "")

  const rows = guestCharges.length
    ? guestCharges.map((gc) => ({
        guests: "1",
        details: gc.guestName || guests[gc.guestIndex]?.name || "",
        hostel: hostelName,
        from: sheetDate(stay.fromDate),
        to: sheetDate(stay.toDate),
        days: nights,
        tariff: money(gc.price),
        gst: money(gc.gstAmount),
        total: money(gc.total),
      }))
    : guests.length
      ? [{
          guests: String(guests.length),
          details: guests.map((g) => g.name).filter(Boolean).join(", "),
          hostel: hostelName,
          from: sheetDate(stay.fromDate),
          to: sheetDate(stay.toDate),
          days: nights,
          tariff: money(quote.feePerPersonPerNight),
          gst: money(quote.gstAmount),
          total: money(total),
        }]
      : []

  return {
    invoiceNumber: request?.invoice?.number || buildInvoiceNumber({ serial: 0 }),
    invoiceDate: request?.invoice?.generatedAt || new Date(),
    gstin,
    total,
    utr: request?.payment?.utr || "",
    requestedBy: studentName || request?.applicantName || "",
    purpose: stay.purpose || "",
    source: "Self",
    rows,
  }
}

/** Render the invoice and resolve with the PDF bytes. */
export const renderInvoicePdf = (model) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN })
      if (hasDevanagari) doc.registerFont("Devanagari", ASSET.devanagari)

      const chunks = []
      doc.on("data", (chunk) => chunks.push(chunk))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", reject)

      let y = drawLetterhead(doc, model)
      y = drawInvoiceMeta(doc, y, model)
      y = drawDeclaration(doc, y, model)
      y = drawChargeTable(doc, y, model)
      y = drawSignatory(doc, y)
      y = drawPaymentDetails(doc, y, model)
      drawComputerGeneratedNote(doc, y)

      doc.end()
    } catch (error) {
      reject(error)
    }
  })

export default { renderInvoicePdf, buildInvoiceModel, amountInWords, buildInvoiceNumber }
