/**
 * Dining Office Dashboard Service
 * Aggregates a system-wide (all caterers / all periods) oversight snapshot for
 * the Dining-role / Office sub-role portal. Read-only; reuses existing dining
 * services so the figures match the admin and caterer views.
 *
 * @module services/dining-office-dashboard
 */

import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { success } from "../../../../services/base/index.js"
import { getCurrentMealScope } from "../dining-meal-verification/dining-meal-verification.service.js"
import { getBillingPeriods } from "../../../administration/modules/admin/dining-billing.service.js"
import { normalizeDay, getDayKey } from "../../../../services/dining/dining-rebate.service.js"

const DAY_MS = 24 * 60 * 60 * 1000
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

const buildCatererBreakdown = (period, caterers) => {
  const capacityById = new Map()
  for (const entry of period?.catererCapacities || []) {
    capacityById.set(String(entry.catererId), {
      maxStudentCount: Number(entry.maxStudentCount || 0),
      allocatedCount: Number(entry.allocatedCount || 0),
    })
  }

  return caterers.map((caterer) => {
    const capacity = capacityById.get(String(caterer._id)) || { maxStudentCount: 0, allocatedCount: 0 }
    const utilization = capacity.maxStudentCount > 0
      ? round2((capacity.allocatedCount / capacity.maxStudentCount) * 100)
      : 0
    return {
      id: caterer._id,
      name: caterer.name,
      email: caterer.email,
      maxStudentCount: capacity.maxStudentCount,
      allocatedCount: capacity.allocatedCount,
      utilization,
    }
  })
}

export const getDiningOfficeDashboard = async () => {
  const now = new Date()
  const todayStart = normalizeDay(now)
  const todayEnd = new Date(todayStart.getTime() + DAY_MS)
  const todayKey = getDayKey(now)

  const { period, mealSlot } = await getCurrentMealScope(now)

  const caterers = await diningQueries.findCaterers({ isArchived: false }, { select: "name email", lean: true })

  let today = { allocated: 0, verified: 0, onRebate: 0, pending: 0, mealSlot: mealSlot?.name || null }

  if (period) {
    const [allocated, verified, onRebate] = await Promise.all([
      allocationQueries.countAllocationsByPeriod(period._id),
      diningQueries.countVerifications({
        periodId: period._id,
        status: "verified",
        scannedAt: { $gte: todayStart, $lt: todayEnd },
      }),
      diningQueries.countRebates({ periodId: period._id, status: "approved", dateKeys: todayKey }),
    ])

    const pending = Math.max(0, allocated - verified - onRebate)
    today = { allocated, verified, onRebate, pending, mealSlot: mealSlot?.name || null }
  }

  const [pendingRebates, approvedToday, upcomingRebates] = await Promise.all([
    diningQueries.countRebates({ status: "pending" }),
    diningQueries.countRebates({ status: "approved", approvedAt: { $gte: todayStart, $lt: todayEnd } }),
    diningQueries.countRebates({ status: "approved", endDate: { $gte: todayEnd } }),
  ])

  // Billing health across active (non-archived) billing periods.
  const billingResult = await getBillingPeriods("false")
  const billingPeriods = Array.isArray(billingResult?.data) ? billingResult.data : []
  const billing = billingPeriods.reduce(
    (acc, bp) => {
      const summary = bp.summary || {}
      acc.totalAllocated += Number(summary.totalAllocated || 0)
      acc.totalCharged += Number(summary.totalCharged || 0)
      acc.totalOutstanding += Number(summary.totalBalance || 0)
      acc.studentCount += Number(summary.studentCount || 0)
      acc.duesCount += Number(summary.duesCount || 0)
      return acc
    },
    { totalAllocated: 0, totalCharged: 0, totalOutstanding: 0, studentCount: 0, duesCount: 0, periodCount: billingPeriods.length },
  )
  billing.totalAllocated = round2(billing.totalAllocated)
  billing.totalCharged = round2(billing.totalCharged)
  billing.totalOutstanding = round2(billing.totalOutstanding)

  return success({
    generatedAt: now.toISOString(),
    activePeriod: period
      ? {
        id: period._id,
        startDate: period.startDate,
        endDate: period.endDate,
        dailyRate: Number(period.dailyRate || 0),
        mealSlots: period.mealSlots || [],
        currentMealSlot: mealSlot?.name || null,
      }
      : null,
    caterers: {
      total: caterers.length,
      breakdown: buildCatererBreakdown(period, caterers),
    },
    today,
    rebates: {
      pending: pendingRebates,
      approvedToday,
      upcoming: upcomingRebates,
    },
    billing,
  })
}
