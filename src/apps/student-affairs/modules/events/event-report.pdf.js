/** A typeset A4 event record: event details, the proposal, and its approval decisions. */
import PDFDocument from "pdfkit"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const font = (subset, weight) => require.resolve(`@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-${subset}-${weight}-normal.woff`)

const INK = "#17283A"
const BODY = "#2E3D4C"
const MUTED = "#5F6E7C"
const ACCENT = "#1360AB"
const ACCENT_SOFT = "#EAF1F9"
const LINE = "#DCE3EA"
const PANEL = "#F5F7FA"
const TONES = {
  success: ["#1E7B4F", "#E6F4EC"],
  danger: ["#B42318", "#FDECEA"],
  warning: ["#9A5B05", "#FDF3E1"],
  info: [ACCENT, ACCENT_SOFT],
  neutral: [MUTED, "#EEF1F4"],
}

const MARGIN = 48
const TOP = 58
const BOTTOM = 60

const EVENT_STATUS = {
  upcoming: ["Upcoming", "neutral"],
  proposal_pending: ["Proposal pending", "warning"],
  proposal_submitted: ["Proposal submitted", "info"],
  proposal_approved: ["Proposal approved", "success"],
  completed: ["Completed", "success"],
  cancelled: ["Cancelled", "danger"],
}
const PROPOSAL_STAGE = {
  pending_president: "President Gymkhana",
  pending_student_affairs: "Office - Student Affairs",
  pending_officer: "Officer SA",
  pending_associate_dean: "Associate Dean SA",
  pending_dean: "Dean SA",
}
// Mega-event chains add stages (e.g. Joint Registrar), so derive rather than enumerate.
const pendingWith = (proposal) =>
  String(proposal?.status || "").startsWith("pending")
    ? proposal.currentApprovalStage
      ? stageLabel(proposal.currentApprovalStage)
      : PROPOSAL_STAGE[proposal.status] || titleCase(proposal.status.replace(/^pending_?/, "")).replace(/\b\w/g, (c) => c.toUpperCase()) || "the reviewers"
    : null
const ACTION = {
  submitted: ["Submitted", "info"],
  recommended: ["Recommended", "warning"],
  approved: ["Approved", "success"],
  rejected: ["Rejected", "danger"],
  revision_requested: ["Revision requested", "warning"],
}
const FUNDS = [
  ["registrationFee", "Registration fees"],
  ["gymkhanaFund", "Gymkhana fund"],
  ["instituteSupport", "Institute support"],
  ["sponsorshipGrant", "Sponsorship / grant"],
]
const REGISTRATION = [
  ["instituteStudents", "Institute students"],
  ["instituteFacultyStaff", "Institute faculty & staff"],
  ["guestsInvitees", "Guests / invitees"],
  ["externalParticipants", "External participants"],
  ["industryProfessionals", "Industry / professionals"],
]
const MANDATE = [
  ["conductProgrammeAsProposed", "Conduct of the programme as proposed"],
  ["chargingRegistrationFees", "Charging registration fees for guests / external participants"],
  ["utilisationOfCollectedFees", "Utilisation of collected fees for programme expenditure"],
  ["additionalInstitutionalSupport", "Additional institutional support"],
]

const titleCase = (value = "") => String(value).replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase())
const stageLabel = (stage) => (stage === "Student Affairs" ? "Office - Student Affairs" : stage || "—")
const blank = (value) => value === null || value === undefined || String(value).trim() === ""
const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 })
const validDate = (value) => (value ? (Number.isNaN(new Date(value).getTime()) ? null : new Date(value)) : null)
export const formatDate = (value) => (validDate(value) ? dateFmt.format(validDate(value)) : "—")
export const formatDateTime = (value) => (validDate(value) ? `${dateFmt.format(validDate(value))}, ${timeFmt.format(validDate(value))} IST` : "—")
export const formatMoney = (value) => (blank(value) || !Number.isFinite(Number(value)) ? "—" : money.format(Number(value)))
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })
const istDay = (value) => Date.parse(isoDay.format(value))
const dayCount = (start, end) => {
  if (!validDate(start) || !validDate(end)) return null
  return Math.round((istDay(validDate(end)) - istDay(validDate(start))) / 86400000) + 1
}
const dateRange = (start, end) => {
  const from = formatDate(start)
  const to = formatDate(end)
  return from === to ? from : `${from} – ${to}`
}

export const renderEventReport = async ({ generatedAt, event, proposal, approvals, documents }) => {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: TOP, bottom: BOTTOM, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: `${event.title} — Event record`, Author: "IIT Indore · Student Gymkhana", Subject: "Event details, proposal and approval history" },
  })
  const chunks = []
  const finished = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })
  for (const [subset, name] of [["latin", ""], ["latin-ext", "Ext"], ["devanagari", "Deva"]]) {
    doc.registerFont(`Body${name}`, font(subset, 400))
    doc.registerFont(`Strong${name}`, font(subset, 700))
  }

  const W = doc.page.width - MARGIN * 2
  const LIMIT = () => doc.page.height - doc.page.margins.bottom
  const ensure = (height) => { if (doc.y + height > LIMIT()) { doc.addPage(); doc.y = TOP } }

  // Noto ships Latin, Latin-extended (incl. ₹) and Devanagari as separate subsets. pdfkit's
  // `continued` text drops to a new line after a second font switch, so lines are laid out
  // here word by word and every font run is placed at an explicit position.
  const fontFor = (char, base) =>
    /[ऀ-ॿ‌‍]/u.test(char) ? `${base}Deva` : /[Ā-ɏ₠-⃀]/u.test(char) ? `${base}Ext` : base
  const layout = (value, { width = W, size = 10, bold = false, spacing = 0 } = {}) => {
    const base = bold ? "Strong" : "Body"
    const widthOf = (name, text) => doc.font(name).fontSize(size).widthOfString(text) + spacing * [...text].length
    const pieces = (word) => {
      const runs = []
      for (const char of word) {
        const name = fontFor(char, base)
        if (runs.at(-1)?.name === name) runs.at(-1).text += char
        else runs.push({ name, text: char })
      }
      runs.forEach((run) => { run.w = widthOf(run.name, run.text) })
      return runs
    }
    const space = widthOf(base, " ")
    const lines = []
    for (const paragraph of String(value ?? "").split(/\r?\n/)) {
      let line = { runs: [], w: 0 }
      const push = (runs, w, gap) => {
        runs.forEach((run, i) => line.runs.push({ ...run, x: line.w + gap + runs.slice(0, i).reduce((s, r) => s + r.w, 0) }))
        line.w += gap + w
      }
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        let runs = pieces(word)
        let w = runs.reduce((s, r) => s + r.w, 0)
        if (line.runs.length && line.w + space + w > width) { lines.push(line); line = { runs: [], w: 0 } }
        // A single word wider than the column (a URL, an email) is split by character.
        while (w > width && [...word].length > 1) {
          const chars = [...runs.map((r) => r.text).join("")]
          let n = chars.length - 1
          while (n > 1 && pieces(chars.slice(0, n).join("")).reduce((s, r) => s + r.w, 0) > width - line.w) n -= 1
          const head = pieces(chars.slice(0, n).join(""))
          push(head, head.reduce((s, r) => s + r.w, 0), 0)
          lines.push(line)
          line = { runs: [], w: 0 }
          runs = pieces(chars.slice(n).join(""))
          w = runs.reduce((s, r) => s + r.w, 0)
          if (w <= width) break
        }
        push(runs, w, line.runs.length ? space : 0)
      }
      lines.push(line)
    }
    return lines
  }
  const lineHeight = (size, bold, lineGap) => doc.font(bold ? "Strong" : "Body").fontSize(size).currentLineHeight(true) + lineGap
  const write = (value, { x = MARGIN, y = doc.y, width = W, size = 10, bold = false, color = BODY, lineGap = 2.5, spacing = 0, align = "left" } = {}) => {
    const lh = lineHeight(size, bold, lineGap)
    // The subsets disagree on ascender height, so every run shares the Latin font's baseline.
    const ascent = (doc.font(bold ? "Strong" : "Body").fontSize(size)._font.ascender / 1000) * size
    let top = y
    for (const line of layout(value, { width, size, bold, spacing })) {
      if (top + lh > LIMIT() && top > TOP) { doc.addPage(); top = TOP }
      const offset = align === "center" ? (width - line.w) / 2 : align === "right" ? width - line.w : 0
      for (const run of line.runs) {
        doc.font(run.name).fontSize(size).fillColor(color).text(run.text, x + offset + run.x, top + ascent, { lineBreak: false, characterSpacing: spacing, baseline: "alphabetic" })
      }
      top += lh
    }
    doc.x = MARGIN
    doc.y = top
  }
  const measure = (value, { width = W, size = 10, bold = false, lineGap = 2.5 } = {}) =>
    layout(value, { width, size, bold }).length * lineHeight(size, bold, lineGap)

  const pill = (label, tone, x, y) => {
    const [fg, bg] = TONES[tone] || TONES.neutral
    doc.font("Strong").fontSize(8)
    const w = doc.widthOfString(label) + 14
    doc.roundedRect(x, y, w, 16, 8).fill(bg)
    write(label, { x: x + 7, y: y + 3.5, width: w, size: 8, bold: true, color: fg, lineGap: 0 })
    return w
  }

  let sectionNo = 0
  const section = (title, intro) => {
    ensure(90)
    if (doc.y > TOP + 4) doc.y += 18
    const y = doc.y
    doc.roundedRect(MARGIN, y, 22, 22, 5).fill(ACCENT)
    write(String(++sectionNo), { x: MARGIN, y: y + 5, width: 22, size: 10, bold: true, color: "#FFFFFF", lineGap: 0, align: "center" })
    write(title, { x: MARGIN + 32, y: y + 2, width: W - 32, size: 15, bold: true, color: INK, lineGap: 0 })
    doc.y = y + 30
    if (intro) { write(intro, { size: 9, color: MUTED }); doc.y += 4 }
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + W, doc.y).lineWidth(0.75).strokeColor(LINE).stroke()
    doc.y += 12
  }

  const kicker = (label) => {
    ensure(46)
    doc.y += 6
    write(label.toUpperCase(), { size: 8, bold: true, color: ACCENT, spacing: 0.8 })
    doc.y += 5
  }

  const LABEL_W = 150
  const row = (label, value, { emphasis = false } = {}) => {
    const empty = blank(value)
    const text = empty ? "Not provided" : String(value)
    const h = Math.max(measure(label, { width: LABEL_W - 12, size: 9 }), measure(text, { width: W - LABEL_W, size: 10, bold: emphasis }))
    ensure(h + 8)
    const y = doc.y
    write(label, { x: MARGIN, y, width: LABEL_W - 12, size: 9, color: MUTED })
    write(text, { x: MARGIN + LABEL_W, y, width: W - LABEL_W, size: 10, bold: emphasis, color: empty ? MUTED : INK })
    doc.y = y + h + 6
  }

  const paragraph = (label, value) => {
    const text = blank(value) ? "Not provided" : String(value).trim()
    const h = measure(text, { width: W - 24, lineGap: 3 })
    ensure(Math.min(h, 120) + 34)
    if (label) { write(label, { size: 9, bold: true, color: INK }); doc.y += 3 }
    const y = doc.y
    const page = doc.page
    write(text, { x: MARGIN + 12, y, width: W - 12, color: blank(value) ? MUTED : BODY, lineGap: 3 })
    const endY = doc.y
    // The quote rule marks short passages; text that runs onto the next page goes without it.
    if (doc.page === page) doc.moveTo(MARGIN + 2, y + 1).lineTo(MARGIN + 2, endY - 2).lineWidth(2).strokeColor(ACCENT_SOFT).stroke()
    doc.y = endY + 10
  }

  const table = (columns, rows, { header = true, total = null } = {}) => {
    const pad = 7
    const widths = columns.map((c) => c.width ?? (W - columns.reduce((s, x) => s + (x.width || 0), 0)))
    const drawRow = (cells, { bold = false, fill = null, color = BODY, size = 9.5 } = {}) => {
      const heights = cells.map((cell, i) => measure(cell, { width: widths[i] - pad * 2, size, bold }))
      const h = Math.max(...heights) + pad * 2
      ensure(h + 2)
      const y = doc.y
      if (fill) doc.rect(MARGIN, y, W, h).fill(fill)
      let x = MARGIN
      cells.forEach((cell, i) => {
        write(cell, { x: x + pad, y: y + pad, width: widths[i] - pad * 2, size, bold, color: cells[i] === "—" ? MUTED : color })
        x += widths[i]
      })
      doc.moveTo(MARGIN, y + h).lineTo(MARGIN + W, y + h).lineWidth(0.5).strokeColor(LINE).stroke()
      doc.y = y + h
    }
    if (header) drawRow(columns.map((c) => c.label), { bold: true, fill: PANEL, color: MUTED, size: 8.5 })
    rows.forEach((cells) => drawRow(cells))
    if (total) drawRow(total, { bold: true, fill: ACCENT_SOFT, color: INK })
    doc.y += 10
  }

  const factGrid = (facts) => {
    const gap = 8
    const w = (W - gap * (facts.length - 1)) / facts.length
    const h = Math.max(...facts.map(([, value, hint]) => 22 + measure(value, { width: w - 20, size: 11, bold: true }) + (hint ? measure(hint, { width: w - 20, size: 8 }) + 2 : 0))) + 10
    ensure(h)
    const y = doc.y
    facts.forEach(([label, value, hint], i) => {
      const x = MARGIN + i * (w + gap)
      doc.roundedRect(x, y, w, h, 6).fill(PANEL)
      write(label.toUpperCase(), { x: x + 10, y: y + 10, width: w - 20, size: 7.5, bold: true, color: MUTED, spacing: 0.6 })
      write(value, { x: x + 10, y: y + 24, width: w - 20, size: 11, bold: true, color: INK })
      if (hint) write(hint, { x: x + 10, y: doc.y + 2, width: w - 20, size: 8, color: MUTED })
    })
    doc.y = y + h + 12
  }

  const tick = (checked, x, y) => {
    doc.roundedRect(x, y, 10, 10, 2).lineWidth(0.9).strokeColor(checked ? TONES.success[0] : LINE).stroke()
    if (checked) doc.moveTo(x + 2.2, y + 5.2).lineTo(x + 4.3, y + 7.4).lineTo(x + 8, y + 2.8).lineWidth(1.4).strokeColor(TONES.success[0]).stroke()
  }

  // ── Masthead ────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 6).fill(ACCENT)
  doc.y = TOP - 8
  write("IIT INDORE  ·  STUDENT GYMKHANA", { size: 8.5, bold: true, color: ACCENT, spacing: 1 })
  doc.y += 8
  write(event.title, { size: 24, bold: true, color: INK, lineGap: 1 })
  doc.y += 4
  write(["Event record", event.kind, event.academicYear && `Academic year ${event.academicYear}`].filter(Boolean).join("   ·   "), { size: 10, color: MUTED })
  doc.y += 10
  {
    const y = doc.y
    let x = MARGIN
    const [statusLabel, statusTone] = EVENT_STATUS[event.status] || [titleCase(event.status || "Unknown"), "neutral"]
    x += pill(event.category || "Uncategorised", "info", x, y) + 6
    pill(statusLabel, statusTone, x, y)
    doc.y = y + 30
  }
  const days = dayCount(event.startDate, event.endDate)
  factGrid([
    ["When", dateRange(event.startDate, event.endDate), days ? `${days} day${days === 1 ? "" : "s"}` : null],
    event.mega ? ["Proposed spend", formatMoney(proposal?.totalExpenditure)] : ["Calendar budget", formatMoney(event.estimatedBudget)],
    ["Proposal due", formatDate(event.proposalDueDate)],
    ["Proposal", proposal ? (pendingWith(proposal) ? "Under review" : titleCase(proposal.status)) : "Not submitted"],
  ])

  // ── 1. Event details ────────────────────────────────────────────────────────
  section("Event details")
  row("Event", event.title, { emphasis: true })
  row("Category", event.category)
  row("Dates", dateRange(event.startDate, event.endDate))
  if (!event.mega) row("Calendar budget", formatMoney(event.estimatedBudget))
  row("Proposal due by", formatDate(event.proposalDueDate))
  row("Event status", (EVENT_STATUS[event.status] || [titleCase(event.status)])[0])
  doc.y += 4
  paragraph("The programme", event.description)

  // ── 2. Proposal ─────────────────────────────────────────────────────────────
  section("Proposal", proposal ? null : "No proposal has been submitted for this event yet.")
  if (proposal) {
    const d = proposal.details || {}
    const pd = d.programmeDetails || {}
    const unit = d.organisingUnit || {}
    const story = d.backgroundAndRationale || {}
    const pending = pendingWith(proposal)
    const [statusLabel, statusTone] = pending
      ? ["Under review", "info"]
      : proposal.status === "approved" ? ["Approved", "success"]
      : proposal.status === "rejected" ? ["Rejected", "danger"]
      : proposal.status === "revision_requested" ? ["Revision requested", "warning"]
      : [titleCase(proposal.status || "Draft"), "neutral"]

    {
      // Status card, as at the top of the proposal modal.
      const lines = [
        `Submitted by ${proposal.submittedBy || "—"} on ${formatDateTime(proposal.submittedAt)}`,
        pending && `Currently with ${pending}`,
        proposal.approvedAt && `Final approval on ${formatDateTime(proposal.approvedAt)}`,
        proposal.status === "rejected" && `Rejected${proposal.rejectedBy ? ` by ${proposal.rejectedBy}` : ""}${proposal.rejectedAt ? ` on ${formatDateTime(proposal.rejectedAt)}` : ""}`,
        proposal.revisionCount > 0 && `Revised ${proposal.revisionCount} time${proposal.revisionCount === 1 ? "" : "s"}`,
      ].filter(Boolean)
      const reason = proposal.status === "rejected" && proposal.rejectionReason ? `Reason: ${proposal.rejectionReason}` : null
      const inner = W - 24
      const h = 38 + lines.reduce((s, l) => s + measure(l, { width: inner, size: 9.5 }) + 2, 0) + (reason ? measure(reason, { width: inner, size: 9.5 }) + 4 : 0)
      ensure(h + 10)
      const y = doc.y
      const [fg, bg] = TONES[statusTone]
      doc.roundedRect(MARGIN, y, W, h, 8).fill(bg)
      doc.rect(MARGIN, y, 4, h).fill(fg)
      write(`STATUS  ·  ${statusLabel.toUpperCase()}`, { x: MARGIN + 14, y: y + 11, width: inner, size: 9, bold: true, color: fg, spacing: 0.6 })
      doc.y = y + 30
      lines.forEach((line) => { write(line, { x: MARGIN + 14, y: doc.y, width: inner, size: 9.5, color: INK }); doc.y += 2 })
      if (reason) write(reason, { x: MARGIN + 14, y: doc.y + 2, width: inner, size: 9.5, bold: true, color: fg })
      doc.y = y + h + 14
    }

    const hasDetails = Object.keys(d).length > 0
    if (!hasDetails) {
      kicker("Proposal summary")
      paragraph(null, proposal.proposalText)
      if (!blank(proposal.externalGuestsDetails)) { kicker("External guests"); paragraph(null, proposal.externalGuestsDetails) }
    } else {
      kicker("Programme")
      row("Programme title", d.programmeTitle, { emphasis: true })
      row("Type", pd.programmeType)
      row("Mode", pd.mode)
      row("Dates and duration", pd.datesAndDuration)
      row("Venue", pd.venue)
      row("Expected participants", pd.expectedParticipants)

      kicker("Organising unit")
      row("Unit type", unit.unitType)
      row("Coordinator(s)", unit.coordinatorNames)
      row("Contact mobile", unit.contactMobile)
      row("Contact email", unit.contactEmail)

      kicker("Background and rationale")
      paragraph("Context and relevance", story.contextRelevance)
      paragraph("Expected impact", story.expectedImpact)
      paragraph("Alignment with institute objectives", story.alignmentWithObjectives)

      const objectives = [d.objectives?.objective1, d.objectives?.objective2, d.objectives?.objective3].filter((o) => !blank(o))
      kicker("Objectives")
      if (!objectives.length) { write("Not provided", { color: MUTED }); doc.y += 8 }
      objectives.forEach((objective, i) => {
        const h = measure(objective, { width: W - 30 })
        ensure(h + 8)
        const y = doc.y
        doc.circle(MARGIN + 8, y + 7, 8).fill(ACCENT_SOFT)
        write(String(i + 1), { x: MARGIN, y: y + 2.5, width: 16, size: 8.5, bold: true, color: ACCENT, lineGap: 0, align: "center" })
        write(objective, { x: MARGIN + 26, y, width: W - 26, color: BODY })
        doc.y = Math.max(doc.y, y + 16) + 6
      })

      kicker("Target participants")
      row("Institute faculty, staff, students", d.targetParticipants?.instituteFacultyStaffStudents)
      row("Guests / invitees", d.targetParticipants?.guestsInvitees)
      row("External visitors / participants", d.targetParticipants?.externalVisitorsParticipants)

      const guests = String(d.guestsDetails?.guestsNamesDesignationAffiliations || "").split(/\n+/).map((g) => g.trim()).filter(Boolean)
      if (guests.length || Number(d.guestsDetails?.tentativeNumberOfSpeakersGuests) > 0) {
        kicker("Guests and speakers")
        row("Number of speakers / guests", d.guestsDetails?.tentativeNumberOfSpeakersGuests)
        if (guests.length) table([{ label: "#", width: 30 }, { label: "Name, designation and affiliation" }], guests.map((g, i) => [String(i + 1), g]))
      }

      kicker("Programme schedule")
      paragraph(null, d.programmeSchedule?.brief)
      const annexure = documents.find((a) => a.label === "Detailed programme schedule")
      if (annexure) { write(`Detailed schedule: see Attachment ${annexure.number}.`, { size: 9, color: MUTED }); doc.y += 8 }

      kicker("Source of funds")
      const funds = FUNDS.map(([key, label]) => [label, formatMoney(d.sourceOfFunds?.[key] || 0)])
      const fundTotal = FUNDS.reduce((sum, [key]) => sum + Number(d.sourceOfFunds?.[key] || 0), 0)
      table([{ label: "Source" }, { label: "Amount", width: 150 }], funds, { total: ["Total expected income", formatMoney(fundTotal)] })

      const registration = REGISTRATION
        .map(([key, label]) => [label, d.registrationDetails?.[key] || {}])
        .filter(([, r]) => Number(r.registrationFee || 0) > 0 || Number(r.accommodationCharges || 0) > 0 || !blank(r.remarks))
      kicker("Registration by category")
      if (!registration.length) { write("No registration fees or accommodation charges.", { color: MUTED }); doc.y += 8 }
      else table([{ label: "Category", width: 150 }, { label: "Registration fee", width: 100 }, { label: "Accommodation", width: 100 }, { label: "Remarks" }],
        registration.map(([label, r]) => [label, formatMoney(r.registrationFee || 0), formatMoney(r.accommodationCharges || 0), blank(r.remarks) ? "—" : r.remarks]))

      kicker("Approval requested for")
      for (const [key, label] of MANDATE) {
        const checked = Boolean(d.approvalRequested?.[key])
        ensure(18)
        const y = doc.y
        tick(checked, MARGIN, y + 1.5)
        write(label, { x: MARGIN + 18, y, width: W - 18, color: checked ? INK : MUTED })
        doc.y += 4
      }
      if (d.approvalRequested?.additionalInstitutionalSupport && !blank(d.approvalRequested?.additionalInstitutionalSupportDetails)) {
        doc.y += 4
        paragraph("Additional support details", d.approvalRequested.additionalInstitutionalSupportDetails)
      } else doc.y += 6
    }

    kicker("Budget")
    const deflection = Number(proposal.budgetDeflection || 0)
    row("Total expected income", formatMoney(proposal.totalExpectedIncome))
    row("Total expenditure", formatMoney(proposal.totalExpenditure), { emphasis: true })
    if (!event.mega) row("Calendar budget at submission", formatMoney(proposal.eventBudgetAtSubmission))
    if (!event.mega) row("Against the calendar budget", deflection > 0 ? `${formatMoney(deflection)} over budget` : deflection < 0 ? `${formatMoney(-deflection)} under budget` : "Within budget")
    row("Accommodation for guests", proposal.accommodationRequired ? "Required" : "Not required")

    kicker("Attached documents")
    if (!documents.length) { write("No documents were uploaded with this proposal.", { color: MUTED }); doc.y += 8 }
    else table([{ label: "Attachment", width: 90 }, { label: "Document" }], documents.map((a) => [`Attachment ${a.number}`, a.label]))
  }

  // ── 3. Approval history ─────────────────────────────────────────────────────
  section("Approval history", proposal ? "Every submission and decision on the proposal, oldest first." : null)
  if (!approvals.length) { write(proposal ? "No decisions have been recorded yet." : "Approval history begins once the proposal is submitted.", { color: MUTED }); doc.y += 8 }
  approvals.forEach((entry, i) => {
    const [label, tone] = ACTION[entry.action] || [titleCase(entry.action || "Recorded"), "neutral"]
    const comments = blank(entry.comments) ? null : `“${entry.comments.trim()}”`
    const textX = MARGIN + 26
    const textW = W - 26
    const h = 34 + (comments ? measure(comments, { width: textW, size: 9.5, lineGap: 3 }) + 4 : 0)
    ensure(h + 8)
    const y = doc.y
    const [fg] = TONES[tone]
    if (i < approvals.length - 1) doc.moveTo(MARGIN + 7, y + 14).lineTo(MARGIN + 7, y + h + 10).lineWidth(1).strokeColor(LINE).stroke()
    doc.circle(MARGIN + 7, y + 7, 5).fill(fg)
    const w = pill(label, tone, textX, y - 1)
    write(stageLabel(entry.stage), { x: textX + w + 8, y: y + 2, width: textW - w - 150, size: 9.5, bold: true, color: INK })
    write(formatDateTime(entry.at), { x: MARGIN + W - 150, y: y + 2.5, width: 150, size: 8.5, color: MUTED, align: "right" })
    write(`by ${entry.by || "Name not recorded"}`, { x: textX, y: y + 19, width: textW, size: 9, color: MUTED })
    if (comments) write(comments, { x: textX, y: y + 34, width: textW, size: 9.5, color: BODY, lineGap: 3 })
    doc.y = y + h + 10
  })

  if (documents.length) {
    doc.y += 6
    ensure(30)
    write(`The ${documents.length === 1 ? "attached document follows" : `${documents.length} attached documents follow`} this report in the numbered order above.`, { size: 9, color: MUTED })
  }

  // ── Running header / footer ─────────────────────────────────────────────────
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i)
    doc.page.margins.bottom = 0
    if (i > 0) {
      write(`${event.title}  ·  Event record`, { x: MARGIN, y: 26, width: W, size: 8, color: MUTED, lineGap: 0 })
      doc.moveTo(MARGIN, 40).lineTo(MARGIN + W, 40).lineWidth(0.5).strokeColor(LINE).stroke()
    }
    const footY = doc.page.height - 36
    doc.moveTo(MARGIN, footY - 8).lineTo(MARGIN + W, footY - 8).lineWidth(0.5).strokeColor(LINE).stroke()
    write(`Generated ${formatDateTime(generatedAt)}`, { x: MARGIN, y: footY, width: W / 2, size: 8, color: MUTED, lineGap: 0 })
    doc.font("Body").fontSize(8).fillColor(MUTED).text(`Page ${i + 1} of ${range.count}`, MARGIN + W / 2, footY, { width: W / 2, align: "right", lineBreak: false })
  }
  doc.end()
  return finished
}
