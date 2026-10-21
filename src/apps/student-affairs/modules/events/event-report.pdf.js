/** A typeset A4 dossier, independent of the web page and its visible tabs. */
import PDFDocument from "pdfkit"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const font = (subset, weight) => require.resolve(`@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-${subset}-${weight}-normal.woff`)
const INK = "#183449"
const MUTED = "#526575"
const ACCENT = "#087E8B"
const LINE = "#D8E2E8"
const plain = (value) => JSON.parse(JSON.stringify(value))
export const fieldLabel = (key) => key === "_id" ? "Record ID" : key.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

export const collectEventDocuments = (bundle) => {
  const documents = new Map()
  const walk = (value, path = []) => {
    if (!value) return
    if (typeof value === "string") {
      if (/^media:\/\//.test(value) || /^\/uploads\//.test(value) || /^https?:\/\/.*\.pdf(?:[?#].*)?$/i.test(value) || (/^https?:\/\//.test(value) && /(?:documentUrl|annexureUrl|attachments.*url)$/i.test(path.join(".")))) {
        const location = path.map(fieldLabel).join(" / ")
        if (!documents.has(value)) documents.set(value, { url: value, label: location, locations: [] })
        documents.get(value).locations.push(location)
      }
      return
    }
    if (Array.isArray(value)) value.forEach((item, i) => walk(item, [...path, String(i + 1)]))
    else if (typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, [...path, key]))
  }
  // Human-readable section names make the attachment index useful.
  for (const section of bundle.sections) walk(section.record, [section.title])
  for (const group of bundle.histories) walk(group.items, [group.title])
  return [...documents.values()].map((document, i) => ({ ...document, number: i + 1 }))
}

export const renderEventReport = async (input) => {
  const { event, sections, histories, documents, generatedAt } = plain(input)
  const doc = new PDFDocument({ size: "A4", margins: { top: 62, bottom: 58, left: 46, right: 46 }, bufferPages: true, info: { Title: `${event.title} — Complete event record`, Author: "IIT Indore · Student Gymkhana", Subject: "Event details, decisions, change history and supporting documents" } })
  const chunks = []
  const finished = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })
  doc.registerFont("Body", font("latin", 400))
  doc.registerFont("Strong", font("latin", 700))
  doc.registerFont("Devanagari", font("devanagari", 400))
  doc.registerFont("Extended", font("latin-ext", 400))
  const width = doc.page.width - 92
  const ensure = (height = 65) => { if (doc.y + height > doc.page.height - 65) doc.addPage() }
  const text = (value, { size = 10, bold = false, color = INK, indent = 0 } = {}) => {
    const content = String(value ?? "Not recorded").replace(/₹/g, "INR ")
    const runs = []
    for (const char of content) {
      const name = /[\u0900-\u097F\u200C\u200D]/u.test(char) ? "Devanagari" : /[\u0100-\u024F]/u.test(char) ? "Extended" : bold ? "Strong" : "Body"
      if (runs.at(-1)?.name === name) runs.at(-1).text += char
      else runs.push({ name, text: char })
    }
    doc.fontSize(size).fillColor(color)
    runs.forEach((run, i) => doc.font(run.name).text(run.text, i === 0 ? 46 + indent : undefined, i === 0 ? doc.y : undefined, { width: width - indent, lineGap: 3, continued: i < runs.length - 1, paragraphGap: 0 }))
  }
  let sectionNumber = 0
  const section = (title) => {
    ensure(100)
    doc.moveDown(1)
    const y = doc.y
    doc.rect(46, y, 3, 22).fill(ACCENT)
    doc.y = y + 2
    text(`${String(++sectionNumber).padStart(2, "0")}   ${title}`, { size: 15, bold: true, indent: 14 })
    doc.moveDown(0.7)
  }
  const moneyFields = new Set(["estimatedBudget", "overallBudget", "registrationFee", "registrationFeeAmount", "accommodationCharges", "totalExpectedIncome", "totalExpenditure", "budgetDeflection", "eventBudgetAtSubmission", "budgetVariance", "gymkhanaFund", "instituteSupport", "sponsorshipGrant", "amount"])
  const scalar = (value, key = "") => {
    if (value === null || value === undefined || value === "") return "Not recorded"
    if (typeof value === "number" && moneyFields.has(key)) return `INR ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    if (typeof value === "string" && ["status", "approvalStatus", "action"].includes(key)) return fieldLabel(value)
    if (typeof value === "boolean") return value ? "Yes" : "No"
    if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")
    if (typeof value === "string" && /^(?:media:\/\/|\/uploads\/|https?:\/\/)/.test(value)) {
      const attachment = documents.find((d) => d.url === value)
      if (attachment) return `Attachment ${attachment.number} · ${value}`
    }
    return String(value)
  }
  const record = (value, indent = 0, omit = []) => {
    if (value === null || value === undefined) { text("Not available at the time of export.", { color: MUTED, indent }); return }
    if (Array.isArray(value)) {
      if (!value.length) text("None recorded", { color: MUTED, indent })
      value.forEach((item, i) => {
        ensure(55)
        text(`Item ${i + 1}`, { bold: true, color: ACCENT, indent })
        if (item && typeof item === "object") record(item, indent + 10)
        else text(scalar(item), { indent: indent + 10 })
        doc.moveDown(0.4)
      })
      return
    }
    if (typeof value !== "object") { text(scalar(value), { indent }); return }
    for (const [key, item] of Object.entries(value)) {
      if (["__v", "id", ...omit].includes(key)) continue
      ensure(48)
      text(fieldLabel(key), { size: 8, bold: true, color: MUTED, indent })
      if (item !== null && typeof item === "object") record(item, Math.min(indent + 10, 80))
      else text(scalar(item, key), { indent })
      doc.moveDown(0.45)
    }
  }

  text("IIT INDORE  /  STUDENT GYMKHANA", { size: 9, bold: true, color: ACCENT })
  doc.moveDown(1.1)
  text(event.title, { size: 27, bold: true })
  doc.moveDown(0.4)
  text("COMPLETE EVENT RECORD", { size: 10, bold: true, color: MUTED })
  doc.moveDown(0.8)
  text(`Status: ${(event.status || "Not recorded").replace(/_/g, " ")}   |   Category: ${event.category || "Not recorded"}`, { size: 11 })
  text(`Generated: ${scalar(generatedAt)}`, { size: 9, color: MUTED })
  text(`Event reference: ${event._id}`, { size: 9, color: MUTED })
  doc.moveDown()
  text("A snapshot of the information recorded at this stage, followed by the original supporting PDFs. All decision dates are shown in UTC. Pending stages have no decision until one is recorded.", { color: MUTED })
  doc.moveDown()
  text("IN THIS RECORD", { size: 9, bold: true, color: ACCENT })
  text([...sections.map((s) => s.title), ...histories.map((h) => h.title), "Supporting document index"].join("  /  "), { size: 9, color: MUTED })

  for (const item of sections) {
    section(item.title)
    record(item.record, 0, item.omit)
  }
  for (const group of histories) {
    section(group.title)
    if (!group.items.length) text("No decisions or changes recorded at this stage.", { color: MUTED })
    for (const [i, entry] of group.items.entries()) {
      ensure(110)
      text(`${i + 1}. ${fieldLabel(entry.action || "Recorded")}  ${entry.stage ? ` / ${entry.stage}` : ""}`, { bold: true, size: 11, color: ACCENT })
      const actor = entry.performedBy || entry.actor
      text(`${actor?.name || (actor?.isSystem ? "System" : "Name not recorded")} · ${scalar(entry.createdAt || entry.at)}`, { bold: true, size: 9 })
      record(entry)
      doc.moveDown(0.5)
      doc.moveTo(46, doc.y).lineTo(doc.page.width - 46, doc.y).strokeColor(LINE).stroke()
      doc.moveDown(0.6)
    }
  }
  section("Supporting document index")
  if (!documents.length) text("No uploaded PDFs are recorded for this event.", { color: MUTED })
  for (const attachment of documents) {
    ensure(70)
    text(`Attachment ${attachment.number}`, { bold: true, color: ACCENT })
    text(attachment.locations.join("; "), { size: 9 })
    doc.moveDown(0.5)
  }
  if (documents.length) text("The supporting PDFs follow in the numbered order above. Repeated references to the same file are included once. This report covers active records; removed proposals and bills remain in the administrative deleted-items workflow.", { size: 9, color: MUTED })
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i)
    // Keep decorations outside the flowing text area without generating extra pages.
    doc.page.margins.bottom = 0
    doc.font("Body").fontSize(8).fillColor(MUTED)
    doc.text("GYMKHANA / EVENT RECORD", 46, 26, { width, lineBreak: false })
    doc.moveTo(46, 44).lineTo(doc.page.width - 46, 44).strokeColor(LINE).stroke()
    doc.text(`Report ${i + 1} / ${range.count}   ·   Supporting PDFs follow the report`, 46, doc.page.height - 33, { width, lineBreak: false })
  }
  doc.end()
  return finished
}
