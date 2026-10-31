/**
 * Dining Auto-Allocation
 * At a period's autoAllocationAt, every eligible student who has not chosen a
 * caterer is assigned to the caterer that currently has the fewest students and
 * still has a free seat, so the caterers' headcounts even out (a full caterer
 * is skipped; the others keep filling). Runs from the job scheduler. Each period is claimed atomically
 * (diningOwner.claimDueAutoAllocationPeriod), so concurrent instances or
 * overlapping ticks never allocate the same period twice. Assignments go
 * through allocationOwner.assignStudent (allowMove:false, no force): the owner
 * is the capacity authority, local counts are only used to pick a caterer.
 * Rows it creates are marked `unregistered` (no student rebates for the
 * period until Admin / Dining Office clears the mark).
 */

import { diningOwner } from '../../../../services/dining/diningOwner.service.js';
import { allocationOwner } from '../../../../services/dining/allocationOwner.service.js';
import { allocationQueries } from '../../../../services/dining/allocationQueries.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';

const normalizeRollNumber = (value = '') => String(value || '').trim().toUpperCase();

const idOf = (value) => String(value?._id || value || '');

const fillRatio = (caterer) => (caterer.max > 0 ? caterer.allocated / caterer.max : 1);

// Fewest students first (self-selected ones included); ties go to the lower
// fill ratio (more room left), then id.
const compareCaterers = (a, b) => (
  a.allocated - b.allocated
  || fillRatio(a) - fillRatio(b)
  || a.catererId.localeCompare(b.catererId)
);

const loadUnallocatedStudents = async (period) => {
  const [eligible, allocations] = await Promise.all([
    studentProfileQueries.findDiningEligibleStudents({
      eligibilityMode: period.eligibilityMode,
      eligibleRollNumbers: (period.eligibleRollNumbers || []).map(normalizeRollNumber).filter(Boolean),
    }),
    allocationQueries.findAllocationsByPeriod(period._id),
  ]);
  const allocated = new Set(allocations.map((row) => idOf(row.studentUserId)));
  return eligible
    .filter((student) => !allocated.has(idOf(student.userId)))
    .sort((a, b) => String(a.rollNumber).localeCompare(String(b.rollNumber)));
};

const allocatePeriod = async (period) => {
  const students = await loadUnallocatedStudents(period);
  const caterers = (period.catererCapacities || []).map((entry) => ({
    catererId: idOf(entry.catererId),
    max: Number(entry.maxStudentCount || 0),
    allocated: Number(entry.allocatedCount || 0),
    full: false,
    assigned: 0,
  }));
  const result = { unallocatedBefore: students.length, assigned: 0, leftOver: 0 };

  for (const student of students) {
    let placed = false;
    let settled = false; // placed, or skipped because someone else allocated them
    let failed = false;
    while (!settled && !failed) {
      const candidates = caterers
        .filter((caterer) => !caterer.full && caterer.allocated < caterer.max)
        .sort(compareCaterers);
      if (candidates.length === 0) break;
      const caterer = candidates[0];

      const outcome = await allocationOwner.assignStudent({
        periodId: period._id,
        studentUserId: student.userId,
        studentProfileId: student._id,
        rollNumber: student.rollNumber,
        catererId: caterer.catererId,
        force: false,
        allowMove: false,
        unregistered: true, // never chose a caterer: no rebates until cleared
      });

      if (outcome.ok) {
        caterer.allocated += 1;
        caterer.assigned += 1;
        placed = true;
        settled = true;
      } else if (outcome.reason === 'full') {
        caterer.full = true; // the owner says it is full: retry on the next caterer
      } else if (outcome.reason === 'already-allocated') {
        settled = true; // raced a manual/self assignment; not ours to count
      } else {
        failed = true;
      }
    }

    if (placed) result.assigned += 1;
    else if (!settled) result.leftOver += 1;
  }

  result.byCaterer = caterers
    .filter((caterer) => caterer.assigned > 0)
    .map((caterer) => ({ catererId: caterer.catererId, assigned: caterer.assigned }));
  return result;
};

/**
 * Runs every due auto-allocation. `now` is injectable for tests.
 * Returns { processed, results: [{ periodId, status, ... }] }.
 */
export const runDueDiningAutoAllocations = async ({ now = new Date() } = {}) => {
  const results = [];
  for (let period = await diningOwner.claimDueAutoAllocationPeriod(now); period; period = await diningOwner.claimDueAutoAllocationPeriod(now)) {
    try {
      const outcome = await allocatePeriod(period);
      await diningOwner.recordAutoAllocationResult(period._id, { status: 'completed', completedAt: new Date(), ...outcome });
      results.push({ periodId: String(period._id), status: 'completed', ...outcome });
      console.log(`[scheduler] dining period ${period._id} auto-allocation: ${outcome.assigned} assigned, ${outcome.leftOver} left over of ${outcome.unallocatedBefore} unallocated`);
    } catch (error) {
      const message = error?.message || String(error);
      console.error(`[scheduler] dining period ${period._id} auto-allocation failed:`, message);
      results.push({ periodId: String(period._id), status: 'failed', error: message });
      try {
        await diningOwner.recordAutoAllocationResult(period._id, { status: 'failed', completedAt: new Date(), error: message });
      } catch (recordError) {
        console.error(`[scheduler] dining period ${period._id} auto-allocation result not recorded:`, recordError?.message || recordError);
      }
    }
  }
  return { processed: results.length, results };
};
