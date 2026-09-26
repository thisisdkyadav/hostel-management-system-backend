import zlib from "node:zlib"
import { describe, it, expect } from "vitest"
import {
  buildInvoiceModel,
  renderInvoicePdf,
} from "../../../src/apps/visitors/modules/accommodation/accommodation.invoice-pdf.js"
import { invoiceExportRows } from "../../../src/apps/visitors/modules/accommodation/accommodation.invoice-export.js"

/** pdfkit stores Helvetica runs as Flate-compressed hex strings. */
const pdfText = (buffer) => {
  const raw = buffer.toString("latin1")
  const chunks = []
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match
  while ((match = re.exec(raw))) {
    try {
      chunks.push(zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"))
    } catch {
      // image / font streams that are not raw deflate
    }
  }
  const parts = []
  for (const hex of chunks.join("\n").matchAll(/<([0-9A-Fa-f]+)>/g)) {
    parts.push(Buffer.from(hex[1], "hex").toString("latin1"))
  }
  return parts.join("")
}

const fourGuestsTwoHostels = () => ({
  applicantName: "Aarav Sharma",
  nights: 3,
  stay: { fromDate: "2026-02-10", toDate: "2026-02-13", purpose: "Convocation" },
  guests: [
    { name: "Sunita Sharma" },
    { name: "Rajesh Sharma" },
    { name: "Meera Iyer" },
    { name: "Arjun Iyer" },
  ],
  quote: {
    nights: 3,
    total: 3360,
    gstAmount: 360,
    guestCharges: [
      { guestIndex: 0, guestName: "Sunita Sharma", price: 750, gstPercentage: 12, gstAmount: 90, total: 840 },
      { guestIndex: 1, guestName: "Rajesh Sharma", price: 750, gstPercentage: 12, gstAmount: 90, total: 840 },
      { guestIndex: 2, guestName: "Meera Iyer", price: 750, gstPercentage: 12, gstAmount: 90, total: 840 },
      { guestIndex: 3, guestName: "Arjun Iyer", price: 750, gstPercentage: 12, gstAmount: 90, total: 840 },
    ],
  },
  payment: { amount: 3360, utr: "205311487629" },
  invoice: { number: "HCU/ACC/25-26/47", generatedAt: "2026-02-13" },
})

describe("accommodation invoice sheet — multi-hostel guest names", () => {
  it("lists every guest name, grouped by hostel, and keeps the full grand total", () => {
    const model = buildInvoiceModel({
      request: fourGuestsTwoHostels(),
      hostelName: "Guest House A and Hall 2",
      hostelNameByGuestIndex: {
        0: "Guest House A",
        1: "Guest House A",
        2: "Hall 2",
        3: "Hall 2",
      },
    })

    expect(model.total).toBe(3360)
    expect(model.rows).toHaveLength(2)

    expect(model.rows[0].hostel).toBe("Guest House A")
    expect(model.rows[0].guests).toBe("2")
    expect(model.rows[0].details).toBe("Sunita Sharma, Rajesh Sharma")
    expect(model.rows[0].total).toBe("1,680.00")

    expect(model.rows[1].hostel).toBe("Hall 2")
    expect(model.rows[1].guests).toBe("2")
    expect(model.rows[1].details).toBe("Meera Iyer, Arjun Iyer")
    expect(model.rows[1].total).toBe("1,680.00")
  })

  it("still lists later guests when every charge row defaulted guestIndex to 0", () => {
    const request = fourGuestsTwoHostels()
    request.quote.guestCharges = request.quote.guestCharges.map((c) => ({
      ...c,
      guestIndex: 0,
      guestName: "",
    }))

    const model = buildInvoiceModel({
      request,
      hostelNameByGuestIndex: {
        0: "Guest House A",
        1: "Guest House A",
        2: "Hall 2",
        3: "Hall 2",
      },
    })

    const names = model.rows.map((row) => row.details).join(", ")
    expect(names).toContain("Sunita Sharma")
    expect(names).toContain("Rajesh Sharma")
    expect(names).toContain("Meera Iyer")
    expect(names).toContain("Arjun Iyer")
    expect(model.total).toBe(3360)
  })

  it("renders a PDF that contains all four names when guests span two hostels", async () => {
    const model = buildInvoiceModel({
      request: fourGuestsTwoHostels(),
      hostelNameByGuestIndex: {
        0: "Guest House A",
        1: "Guest House A",
        2: "Hall 2",
        3: "Hall 2",
      },
    })
    const text = pdfText(await renderInvoicePdf(model))
    expect(text).toContain("Sunita Sharma")
    expect(text).toContain("Rajesh Sharma")
    expect(text).toContain("Meera Iyer")
    expect(text).toContain("Arjun Iyer")
  })

  it("sums verified extra payments and lists every UTR on the sheet", () => {
    const request = fourGuestsTwoHostels()
    request.payment = { amount: 3360, status: "Verified", utr: "205311487629" }
    request.additionalPayments = [
      { amount: 500, status: "Verified", utr: "111122223333", label: "Extra nights" },
      { amount: 200, status: "Pending", utr: "000000000000", label: "Ignored" },
    ]
    const model = buildInvoiceModel({
      request,
      hostelNameByGuestIndex: { 0: "Guest House A", 1: "Guest House A", 2: "Hall 2", 3: "Hall 2" },
    })
    expect(model.total).toBe(3860)
    expect(model.utr).toBe("205311487629 · 111122223333")
    expect(model.rows.some((row) => row.details === "Extra nights")).toBe(true)
    expect(model.rows.some((row) => row.details === "Ignored")).toBe(false)
  })

  it("export rows are one line per settled payment with stay period and UTR", () => {
    const request = fourGuestsTwoHostels()
    request.applicantName = "Aarav Sharma"
    request.applicantEmail = "aarav@iiti.ac.in"
    request.payment = { amount: 3360, status: "Verified", utr: "205311487629", paidAt: "2026-02-13" }
    request.additionalPayments = [
      { amount: 500, status: "Verified", utr: "111122223333", paidAt: "2026-02-14", label: "Extra nights" },
    ]
    const rows = invoiceExportRows([request])
    expect(rows).toHaveLength(2)
    expect(rows[0][0]).toBe("Aarav Sharma")
    expect(rows[0][1]).toBe("aarav@iiti.ac.in")
    expect(rows[0][2]).toMatch(/Feb/)
    expect(rows[0][4]).toBe("205311487629")
    expect(rows[1][3]).toBe("500.00")
    expect(rows[1][4]).toBe("111122223333")
  })

  it("draws more than three body rows so a fourth hostel's guests are not dropped", async () => {
    const request = fourGuestsTwoHostels()
    const model = buildInvoiceModel({
      request,
      hostelNameByGuestIndex: {
        0: "Hall 1",
        1: "Hall 2",
        2: "Hall 3",
        3: "Hall 4",
      },
    })
    expect(model.rows).toHaveLength(4)
    const text = pdfText(await renderInvoicePdf(model))
    expect(text).toContain("Sunita Sharma")
    expect(text).toContain("Rajesh Sharma")
    expect(text).toContain("Meera Iyer")
    expect(text).toContain("Arjun Iyer")
    expect(text).toContain("Hall 4")
  })
})
