import { describe, it, expect, beforeAll } from "vitest"
import { setupTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

/**
 * Integration tests for /api/v1/student-affairs/expenditure.
 *
 * Auth wiring: router.use(authenticate) + routeGuard({Admin:
 * "route.admin.expenditure"}, { onUnmapped: "allow" }) with MANAGER_ROLES
 * [Admin, Super Admin] — Super Admin falls through the guard unmapped and is
 * gated by RBAC only.
 *
 * Envelope: controllers use sendStandardResponse -> full
 * { success, message, data, errors } envelope.
 */

const BASE = "/api/v1/student-affairs/expenditure"

const attachment = (ref = "https://files.hms.test/doc.pdf") => ({
  fileRef: ref,
  originalName: "doc.pdf",
  contentType: "application/pdf",
  size: 1024,
})

describe("student-affairs /expenditure", () => {
  let admin
  let superAdminUser
  let studentUser
  let wardenUser

  beforeAll(async () => {
    await setupTestDb()
    admin = await seed.admin()
    superAdminUser = await seed.superAdmin()
    studentUser = await seed.student()
    wardenUser = await seed.warden()
  })

  const createOccurrence = async (payload = {}) => {
    const api = await as(admin)
    return api.post(BASE).send({
      title: "Tech Fest Budget",
      description: "Occurrence for integration tests",
      totalBudget: 10000,
      ...payload,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHZ
  // ═══════════════════════════════════════════════════════════════════════════
  describe("authz", () => {
    it("401 for unauthenticated list", async () => {
      const api = await anon()
      const res = await api.get(BASE)
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })

    it("403 for Student (RBAC gate)", async () => {
      const api = await as(studentUser)
      const res = await api.get(BASE)
      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
    })

    it("403 for Warden on create", async () => {
      const api = await as(wardenUser)
      const res = await api.post(BASE).send({ title: "Nope Occurrence" })
      expect(res.status).toBe(403)
    })

    it("Super Admin passes (unmapped by the guard, allowed by RBAC)", async () => {
      const api = await as(superAdminUser)
      const res = await api.post(BASE).send({ title: "SA Office Budget" })
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // OCCURRENCE CRUD
  // ═══════════════════════════════════════════════════════════════════════════
  describe("occurrences", () => {
    let occurrenceId

    it("422 when title is missing", async () => {
      const api = await as(admin)
      const res = await api.post(BASE).send({ description: "no title" })
      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it("422 when title is too short", async () => {
      const api = await as(admin)
      const res = await api.post(BASE).send({ title: "A" })
      expect(res.status).toBe(422)
    })

    it("422 for negative totalBudget", async () => {
      const api = await as(admin)
      const res = await api.post(BASE).send({ title: "Negative Budget", totalBudget: -5 })
      expect(res.status).toBe(422)
    })

    it("201 creates an occurrence with zeroed totals", async () => {
      const res = await createOccurrence()
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe("Expenditure occurrence created")
      expect(res.body.data.occurrence.title).toBe("Tech Fest Budget")
      expect(res.body.data.occurrence.status).toBe("open")
      expect(res.body.data.totals).toMatchObject({
        totalBudget: 10000,
        expenseTotal: 0,
        paymentTotal: 0,
        billTotal: 0,
        remainingBudget: 10000,
        netBalance: 0,
        expenseCount: 0,
        paymentCount: 0,
        documentCount: 0,
      })
      occurrenceId = res.body.data.occurrence._id
    })

    it("GET / lists occurrences with derived fields; search filters by title", async () => {
      const api = await as(admin)
      const list = await api.get(BASE)
      expect(list.status).toBe(200)
      expect(list.body.success).toBe(true)
      expect(list.body.data.occurrences.length).toBeGreaterThanOrEqual(2)

      const searched = await api.get(BASE).query({ search: "tech fest" })
      expect(searched.status).toBe(200)
      expect(searched.body.data.occurrences).toHaveLength(1)
      expect(searched.body.data.occurrences[0]._id).toBe(occurrenceId)
      expect(searched.body.data.occurrences[0].expenseTotal).toBe(0)
      expect(searched.body.data.occurrences[0].remainingBudget).toBe(10000)
    })

    it("422 for invalid status filter value", async () => {
      const api = await as(admin)
      const res = await api.get(BASE).query({ status: "bogus" })
      expect(res.status).toBe(422)
    })

    it("GET /:id returns the occurrence + totals; 404 unknown; 422 bad id", async () => {
      const api = await as(admin)
      const ok = await api.get(`${BASE}/${occurrenceId}`)
      expect(ok.status).toBe(200)
      expect(ok.body.data.occurrence._id).toBe(occurrenceId)
      expect(ok.body.data.totals.totalBudget).toBe(10000)

      const missing = await api.get(`${BASE}/000000000000000000000000`)
      expect(missing.status).toBe(404)
      expect(missing.body.success).toBe(false)
      expect(missing.body.message).toMatch(/not found/i)

      const bad = await api.get(`${BASE}/not-an-id`)
      expect(bad.status).toBe(422)
    })

    it("PATCH /:id updates fields; validates enum and min(1) body", async () => {
      const api = await as(admin)
      const empty = await api.patch(`${BASE}/${occurrenceId}`).send({})
      expect(empty.status).toBe(422)

      const badStatus = await api
        .patch(`${BASE}/${occurrenceId}`)
        .send({ status: "archived" })
      expect(badStatus.status).toBe(422)

      const ok = await api.patch(`${BASE}/${occurrenceId}`).send({
        title: "Tech Fest Budget v2",
        totalBudget: 12000,
      })
      expect(ok.status).toBe(200)
      expect(ok.body.message).toBe("Expenditure occurrence updated")
      expect(ok.body.data.occurrence.title).toBe("Tech Fest Budget v2")
      expect(ok.body.data.occurrence.totalBudget).toBe(12000)
      expect(ok.body.data.totals.remainingBudget).toBe(12000)
    })

    it("DELETE /:id removes the occurrence; subsequent GET is 404", async () => {
      const api = await as(admin)
      const temp = await createOccurrence({ title: "Temp Deletion Target" })
      const tempId = temp.body.data.occurrence._id

      const deleted = await api.delete(`${BASE}/${tempId}`)
      expect(deleted.status).toBe(200)
      expect(deleted.body.message).toBe("Expenditure occurrence deleted")

      const gone = await api.get(`${BASE}/${tempId}`)
      expect(gone.status).toBe(404)

      const again = await api.delete(`${BASE}/${tempId}`)
      expect(again.status).toBe(404)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPENSES
  // ═══════════════════════════════════════════════════════════════════════════
  describe("expenses", () => {
    let occurrenceId
    let expenseId

    beforeAll(async () => {
      const res = await createOccurrence({ title: "Expense Playground", totalBudget: 5000 })
      occurrenceId = res.body.data.occurrence._id
    })

    it("422 when amount is missing or negative", async () => {
      const api = await as(admin)
      const noAmount = await api.post(`${BASE}/${occurrenceId}/expenses`).send({ title: "X" })
      expect(noAmount.status).toBe(422)

      const negative = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({ title: "Negative Expense", amount: -10 })
      expect(negative.status).toBe(422)
    })

    it("422 when attachment lacks fileRef", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({
          title: "Bad Attachment",
          amount: 10,
          attachments: [{ originalName: "no-ref.pdf" }],
        })
      expect(res.status).toBe(422)
    })

    it("404 adding an expense to an unknown occurrence", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/000000000000000000000000/expenses`)
        .send({ title: "Ghost", amount: 1 })
      expect(res.status).toBe(404)
    })

    it("201 adds an expense and updates totals", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/expenses`).send({
        title: "Venue Booking",
        category: "logistics",
        amount: 1500,
        notes: "Advance paid",
        attachments: [attachment()],
      })
      expect(res.status).toBe(201)
      expect(res.body.message).toBe("Expense added")
      expect(res.body.data.occurrence.expenses).toHaveLength(1)
      expenseId = res.body.data.occurrence.expenses[0]._id

      expect(res.body.data.totals.expenseTotal).toBe(1500)
      expect(res.body.data.totals.remainingBudget).toBe(3500)
      expect(res.body.data.totals.netBalance).toBe(-1500)
      expect(res.body.data.totals.documentCount).toBe(0)
    })

    it("PATCH updates the expense and recomputes totals", async () => {
      const api = await as(admin)
      const res = await api
        .patch(`${BASE}/${occurrenceId}/expenses/${expenseId}`)
        .send({ amount: 2000, notes: "Final bill higher than advance" })
      expect(res.status).toBe(200)
      expect(res.body.message).toBe("Expense updated")
      expect(res.body.data.totals.expenseTotal).toBe(2000)
      expect(res.body.data.totals.remainingBudget).toBe(3000)
    })

    it("404 updating/deleting an unknown expense id", async () => {
      const api = await as(admin)
      const missing = await api
        .patch(`${BASE}/${occurrenceId}/expenses/000000000000000000000000`)
        .send({ amount: 1 })
      expect(missing.status).toBe(404)
      expect(missing.body.message).toMatch(/Expense not found/)

      const delMissing = await api.delete(
        `${BASE}/${occurrenceId}/expenses/000000000000000000000000`
      )
      expect(delMissing.status).toBe(404)
    })

    it("DELETE removes the expense and restores totals", async () => {
      const api = await as(admin)
      const added = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({ title: "Temporary Expense", amount: 100 })
      const tempExpenseId = added.body.data.occurrence.expenses.find(
        (e) => e.title === "Temporary Expense"
      )._id

      const removed = await api.delete(`${BASE}/${occurrenceId}/expenses/${tempExpenseId}`)
      expect(removed.status).toBe(200)
      expect(removed.body.message).toBe("Expense removed")
      expect(removed.body.data.totals.expenseTotal).toBe(2000)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // BILLS (nested under an expense)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("bills", () => {
    let occurrenceId
    let expenseId
    let billId

    beforeAll(async () => {
      const res = await createOccurrence({ title: "Bill Playground", totalBudget: 3000 })
      occurrenceId = res.body.data.occurrence._id
      const api = await as(admin)
      const added = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({ title: "Catering", amount: 800 })
      expenseId = added.body.data.occurrence.expenses[0]._id
    })

    it("201 adds a bill under the expense (billTotal tracked)", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/expenses/${expenseId}/bills`)
        .send({
          vendor: "Tasty Caterers",
          billNumber: "TC-001",
          amount: 750,
          notes: "Part 1 of catering",
        })
      expect(res.status).toBe(201)
      expect(res.body.message).toBe("Bill added")
      const expense = res.body.data.occurrence.expenses.find((e) => e._id === expenseId)
      expect(expense.bills).toHaveLength(1)
      billId = expense.bills[0]._id
      expect(res.body.data.totals.billTotal).toBe(750)
    })

    it("404 adding a bill to an unknown expense", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/expenses/000000000000000000000000/bills`)
        .send({ amount: 5 })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/Expense not found/)
    })

    it("PATCH updates the bill", async () => {
      const api = await as(admin)
      const res = await api
        .patch(`${BASE}/${occurrenceId}/expenses/${expenseId}/bills/${billId}`)
        .send({ amount: 800, billNumber: "TC-001-REV" })
      expect(res.status).toBe(200)
      expect(res.body.message).toBe("Bill updated")
      expect(res.body.data.totals.billTotal).toBe(800)
    })

    it("404 for unknown bill id on update/delete", async () => {
      const api = await as(admin)
      const missing = await api
        .patch(`${BASE}/${occurrenceId}/expenses/${expenseId}/bills/000000000000000000000000`)
        .send({ amount: 1 })
      expect(missing.status).toBe(404)
      expect(missing.body.message).toMatch(/Bill not found/)

      const delMissing = await api.delete(
        `${BASE}/${occurrenceId}/expenses/${expenseId}/bills/000000000000000000000000`
      )
      expect(delMissing.status).toBe(404)
    })

    it("DELETE removes the bill", async () => {
      const api = await as(admin)
      const removed = await api.delete(
        `${BASE}/${occurrenceId}/expenses/${expenseId}/bills/${billId}`
      )
      expect(removed.status).toBe(200)
      expect(removed.body.message).toBe("Bill removed")
      expect(removed.body.data.totals.billTotal).toBe(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("payments", () => {
    let occurrenceId
    let paymentId

    beforeAll(async () => {
      const res = await createOccurrence({ title: "Payment Playground", totalBudget: 4000 })
      occurrenceId = res.body.data.occurrence._id
      const api = await as(admin)
      await api.post(`${BASE}/${occurrenceId}/expenses`).send({ title: "Costs", amount: 1000 })
    })

    it("422 when payment amount is missing", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/payments`).send({ source: "SAC" })
      expect(res.status).toBe(422)
    })

    it("201 adds a payment and netBalance reflects it", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/payments`).send({
        source: "Student Affairs Fund",
        amount: 2500,
        method: "bank-transfer",
        reference: "TXN-991",
      })
      expect(res.status).toBe(201)
      expect(res.body.message).toBe("Payment added")
      paymentId = res.body.data.occurrence.payments[0]._id
      expect(res.body.data.totals.paymentTotal).toBe(2500)
      expect(res.body.data.totals.netBalance).toBe(1500) // 2500 received - 1000 spent
    })

    it("404 for unknown occurrence/payment on update", async () => {
      const api = await as(admin)
      const missingOcc = await api
        .patch(`${BASE}/000000000000000000000000/payments/${paymentId}`)
        .send({ amount: 1 })
      expect(missingOcc.status).toBe(404)

      const missingPay = await api
        .patch(`${BASE}/${occurrenceId}/payments/000000000000000000000000`)
        .send({ amount: 1 })
      expect(missingPay.status).toBe(404)
      expect(missingPay.body.message).toMatch(/Payment not found/)
    })

    it("PATCH updates the payment", async () => {
      const api = await as(admin)
      const res = await api
        .patch(`${BASE}/${occurrenceId}/payments/${paymentId}`)
        .send({ amount: 2600, reference: "TXN-991-REV" })
      expect(res.status).toBe(200)
      expect(res.body.message).toBe("Payment updated")
      expect(res.body.data.totals.paymentTotal).toBe(2600)
    })

    it("DELETE removes the payment", async () => {
      const api = await as(admin)
      const removed = await api.delete(`${BASE}/${occurrenceId}/payments/${paymentId}`)
      expect(removed.status).toBe(200)
      expect(removed.body.message).toBe("Payment removed")
      expect(removed.body.data.totals.paymentTotal).toBe(0)
      expect(removed.body.data.totals.netBalance).toBe(-1000)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // OCCURRENCE DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("documents", () => {
    let occurrenceId
    let documentId

    beforeAll(async () => {
      const res = await createOccurrence({ title: "Document Playground" })
      occurrenceId = res.body.data.occurrence._id
    })

    it("422 when attachments array is empty", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/documents`).send({ attachments: [] })
      expect(res.status).toBe(422)
    })

    it("422 for invalid fileRef format", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/documents`)
        .send({ attachments: [{ fileRef: "not-a-url-or-media-ref" }] })
      expect(res.status).toBe(422)
    })

    it("201 adds documents and increments documentCount", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/documents`).send({
        attachments: [attachment("https://files.hms.test/sanction.pdf"), attachment("media://abc123")],
      })
      expect(res.status).toBe(201)
      expect(res.body.message).toBe("Documents added")
      expect(res.body.data.totals.documentCount).toBe(2)
      documentId = res.body.data.occurrence.documents[0]._id
    })

    it("404 for unknown occurrence", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/000000000000000000000000/documents`)
        .send({ attachments: [attachment()] })
      expect(res.status).toBe(404)
    })

    it("DELETE removes one document; unknown documentId is 404", async () => {
      const api = await as(admin)
      const missing = await api.delete(
        `${BASE}/${occurrenceId}/documents/000000000000000000000000`
      )
      expect(missing.status).toBe(404)
      expect(missing.body.message).toMatch(/Document not found/)

      const removed = await api.delete(`${BASE}/${occurrenceId}/documents/${documentId}`)
      expect(removed.status).toBe(200)
      expect(removed.body.message).toBe("Document removed")
      expect(removed.body.data.totals.documentCount).toBe(1)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: ATTACHMENT COUNT BOUNDARY (MAX_ATTACHMENTS = 20)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: attachment boundaries", () => {
    let occurrenceId

    const refAt = (i) => `media://itest-attach-${String(i).padStart(3, "0")}`
    const manyAttachments = (n) =>
      Array.from({ length: n }, (_, i) => attachment(refAt(i)))

    beforeAll(async () => {
      const res = await createOccurrence({ title: "Attachment Boundary Playground" })
      occurrenceId = res.body.data.occurrence._id
    })

    it("201 accepts exactly 20 attachments (cap boundary) and persists them", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/expenses`).send({
        title: "Capped Attachments Expense",
        amount: 10,
        attachments: manyAttachments(20),
      })
      expect(res.status).toBe(201)
      const stored = res.body.data.occurrence.expenses.find(
        (e) => e.title === "Capped Attachments Expense"
      )
      expect(stored.attachments).toHaveLength(20)
      expect(stored.attachments[19].fileRef).toBe(refAt(19))
    })

    it("422 for 21 attachments (one past the cap)", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/expenses`).send({
        title: "Over Cap Expense",
        amount: 10,
        attachments: manyAttachments(21),
      })
      expect(res.status).toBe(422)
      expect(JSON.stringify(res.body.errors)).toMatch(/20/)
    })

    it("422 for occurrence documents above the same cap", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/documents`)
        .send({ attachments: manyAttachments(21) })
      expect(res.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: AMOUNT EDGE CASES (zero / huge / string / negative payments)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: amount edge cases", () => {
    let occurrenceId

    beforeAll(async () => {
      const res = await createOccurrence({ title: "Amount Edge Playground", totalBudget: 100 })
      occurrenceId = res.body.data.occurrence._id
    })

    it("201 accepts a zero-amount expense without changing expenseTotal", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({ title: "Zero Cost Item", amount: 0 })
      expect(res.status).toBe(201)
      expect(res.body.data.totals.expenseTotal).toBe(0)
      expect(res.body.data.totals.expenseCount).toBe(1)
    })

    it("422 for a string amount", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({ title: "String Amount", amount: "lots" })
      expect(res.status).toBe(422)
    })

    it("201 accepts a very large numeric amount and totals stay exact", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/payments`).send({
        source: "Endowment",
        amount: 9007199254740991, // Number.MAX_SAFE_INTEGER
      })
      expect(res.status).toBe(201)
      expect(res.body.data.totals.paymentTotal).toBe(9007199254740991)
    })

    it("422 for a negative payment amount", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/payments`)
        .send({ source: "Refund Attempt", amount: -50 })
      expect(res.status).toBe(422)
    })

    it("bill amount defaults to 0 when omitted", async () => {
      const api = await as(admin)
      const expenseRes = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({ title: "Bill Default Parent", amount: 5 })
      const expenseId = expenseRes.body.data.occurrence.expenses.find(
        (e) => e.title === "Bill Default Parent"
      )._id

      const res = await api
        .post(`${BASE}/${occurrenceId}/expenses/${expenseId}/bills`)
        .send({ vendor: "No Amount Vendor" })
      expect(res.status).toBe(201)
      expect(res.body.data.totals.billTotal).toBe(0)
    })

    it("422 for a non-ISO incurredAt value", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/expenses`).send({
        title: "Bad Date",
        amount: 1,
        incurredAt: "31/12/2026",
      })
      expect(res.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: CATEGORY IS FREE-FORM (documented behavior — no enum)
  // The schema validates category only as text(100); arbitrary values persist.
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: category boundaries", () => {
    let occurrenceId

    beforeAll(async () => {
      const res = await createOccurrence({ title: "Category Playground" })
      occurrenceId = res.body.data.occurrence._id
    })

    it("accepts an out-of-vocabulary category and persists it verbatim", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${occurrenceId}/expenses`).send({
        title: "Odd Category",
        category: "warp-core-consumables",
        amount: 42,
      })
      expect(res.status).toBe(201)
      const stored = res.body.data.occurrence.expenses.find((e) => e.title === "Odd Category")
      expect(stored.category).toBe("warp-core-consumables")
    })

    it("422 for a category longer than 100 chars", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/${occurrenceId}/expenses`)
        .send({ title: "Long Category", category: "x".repeat(101), amount: 1 })
      expect(res.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: LIST FILTERS + OCCURRENCE STATUS TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: status filter lifecycle", () => {
    let openId
    let closedId

    beforeAll(async () => {
      const openRes = await createOccurrence({ title: "Still Open Occurrence" })
      openId = openRes.body.data.occurrence._id
      const closedRes = await createOccurrence({ title: "Now Closed Occurrence" })
      closedId = closedRes.body.data.occurrence._id
      const api = await as(admin)
      await api.patch(`${BASE}/${closedId}`).send({ status: "closed" })
    })

    it("status=open excludes closed occurrences; status=closed includes only those", async () => {
      const api = await as(admin)

      const openList = await api.get(BASE).query({ status: "open" })
      expect(openList.status).toBe(200)
      expect(
        openList.body.data.occurrences.some((o) => o._id === closedId)
      ).toBe(false)
      expect(
        openList.body.data.occurrences.some((o) => o._id === openId)
      ).toBe(true)

      const closedList = await api.get(BASE).query({ status: "closed" })
      expect(closedList.status).toBe(200)
      expect(closedList.body.data.occurrences.map((o) => o._id)).toContain(closedId)
      expect(closedList.body.data.occurrences.every((o) => o._id !== openId)).toBe(true)
    })

    // SUSPECTED BUG (documented behavior): closing an occurrence does NOT lock
    // it — expenses/bills/payments/documents can still be mutated freely while
    // the occurrence is "closed".
    it("entries can still be mutated after the occurrence is closed", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/${closedId}/expenses`).send({
        title: "Post Closure Expense",
        amount: 25,
      })
      expect(res.status).toBe(201)
      expect(res.body.data.totals.expenseTotal).toBe(25)
    })

    it("reopen path: patching back to open is reflected in the open filter", async () => {
      const api = await as(admin)
      const reopened = await api.patch(`${BASE}/${closedId}`).send({ status: "open" })
      expect(reopened.status).toBe(200)
      expect(reopened.body.data.occurrence.status).toBe("open")

      const closedList = await api.get(BASE).query({ status: "closed" })
      expect(closedList.body.data.occurrences.some((o) => o._id === closedId)).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: CROSS-REFERENCE PARAM EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: cross-reference params", () => {
    let occA
    let occB
    let expenseInA

    beforeAll(async () => {
      const a = await createOccurrence({ title: "Cross Ref A" })
      occA = a.body.data.occurrence._id
      const b = await createOccurrence({ title: "Cross Ref B" })
      occB = b.body.data.occurrence._id

      const api = await as(admin)
      const added = await api
        .post(`${BASE}/${occA}/expenses`)
        .send({ title: "Belongs To A", amount: 10 })
      expenseInA = added.body.data.occurrence.expenses[0]._id
    })

    it("404 when the occurrence id does not match the expense's parent", async () => {
      const api = await as(admin)
      const patched = await api
        .patch(`${BASE}/${occB}/expenses/${expenseInA}`)
        .send({ amount: 99 })
      expect(patched.status).toBe(404)
      // The parent occurrence exists, so the nested expense lookup is what fails
      expect(patched.body.message).toMatch(/Expense not found/)
    })

    it("404 when deleting an expense through the wrong parent occurrence", async () => {
      const api = await as(admin)
      const res = await api.delete(`${BASE}/${occB}/expenses/${expenseInA}`)
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/Expense not found/)

      // The expense survives the failed deletion
      const verify = await api.get(`${BASE}/${occA}`)
      expect(verify.body.data.occurrence.expenses).toHaveLength(1)
    })

    it("422 for malformed nested param ids", async () => {
      const api = await as(admin)
      const badExpenseId = await api.patch(`${BASE}/${occA}/expenses/nope`).send({ amount: 1 })
      expect(badExpenseId.status).toBe(422)

      const badPaymentId = await api.delete(`${BASE}/${occA}/payments/nope`)
      expect(badPaymentId.status).toBe(422)

      const badDocId = await api.delete(`${BASE}/${occA}/documents/nope`)
      expect(badDocId.status).toBe(422)
    })
  })
})
