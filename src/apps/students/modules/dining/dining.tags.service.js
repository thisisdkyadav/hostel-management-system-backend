/**
 * Student Dining Tags
 * Yes/no dining attributes a student answers themselves:
 * - allocation (period) tags: asked when choosing a caterer; the answer can be
 *   changed until the period's first service day starts (server-local
 *   midnight of startDate).
 * - standalone tags with an open form: answerable until the form closes, by
 *   active students in the form's audience.
 * Writes go through services/dining/tagOwner (source "student").
 */

import mongoose from 'mongoose';
import { success, badRequest, notFound } from '../../../../services/base/index.js';
import { tagOwner } from '../../../../services/dining/tagOwner.service.js';
import { tagQueries } from '../../../../services/dining/tagQueries.service.js';
import { diningQueries } from '../../../../services/dining/diningQueries.service.js';
import { allocationQueries } from '../../../../services/dining/allocationQueries.service.js';
import { periodDay } from '../../../../services/dining/periodDay.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';

const idOf = (value) => String(value?._id || value || '');
const keyOf = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);
const pad2 = (n) => String(n).padStart(2, '0');

/** Server-local midnight starting a period's first day (period dates are UTC-midnight calendar days). */
export const periodFirstDayStart = (startDate) => {
  const d = new Date(startDate);
  return new Date(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T00:00:00`);
};

const isFormOpen = (tag, now) => Boolean(
  !tag.isArchived && tag.form?.enabled && tag.form.opensAt && tag.form.closesAt
  && new Date(tag.form.opensAt) <= now && now <= new Date(tag.form.closesAt)
);

const inAudience = (tag, profile) => {
  if (!profile || profile.status !== 'Active') return false;
  if (tag.form?.audience !== 'custom') return true;
  const roll = String(profile.rollNumber || '').trim().toUpperCase();
  return (tag.form.rollNumbers || []).includes(roll);
};

/** Live tags of a period, as the questions asked at caterer selection. */
export const getSelectionQuestions = async (periodId) => {
  if (!periodId) return [];
  const tags = await tagQueries.findPeriodTags([periodId]);
  return tags.map((tag) => ({ id: idOf(tag), name: tag.name, question: tag.question || '' }));
};

/**
 * Check caterer-selection answers against a period's live tags. Returns
 * { error } or { answers: [{ tagId, value }] } (only the period's tags).
 */
export const validateSelectionAnswers = async (periodId, tagAnswers) => {
  const tags = await tagQueries.findPeriodTags([periodId]);
  if (!tags.length) return { answers: [] };
  const given = new Map();
  (Array.isArray(tagAnswers) ? tagAnswers : []).forEach((entry) => {
    if (typeof entry?.value === 'boolean' && entry?.tagId) given.set(String(entry.tagId), entry.value);
  });
  const missing = tags.filter((tag) => !given.has(idOf(tag)));
  if (missing.length) return { error: `Please answer: ${missing.map((tag) => tag.name).join(', ')}` };
  return { answers: tags.map((tag) => ({ tagId: tag._id, value: given.get(idOf(tag)) })) };
};

const serializeItem = (tag, { period = null, valueRow = null, editable, editableUntil }) => {
  const value = valueRow ? valueRow.value : null;
  const isPeriod = tag.kind === 'period';
  return {
    tagId: idOf(tag),
    kind: tag.kind,
    name: tag.name,
    question: tag.question || '',
    description: tag.description || '',
    value,
    effective: value ?? tag.defaultValue ?? null,
    defaultValue: tag.defaultValue ?? null,
    editable,
    editableUntil: editableUntil ? editableUntil.toISOString() : null,
    ...(isPeriod && period ? { period: { id: idOf(period), startDate: keyOf(period.startDate), endDate: keyOf(period.endDate) } } : {}),
    startDate: isPeriod ? keyOf(period?.startDate) : keyOf(tag.startDate),
    endDate: isPeriod ? keyOf(period?.endDate) : keyOf(tag.endDate),
  };
};

const periodItemState = (period, now) => {
  const editableUntil = periodFirstDayStart(period.startDate);
  return { editable: !period.isArchived && now < editableUntil, editableUntil };
};

export const listStudentDiningTags = async (userId) => {
  const profile = await studentProfileQueries.findByUserId(userId, { select: '_id rollNumber status', lean: true });
  if (!profile) return notFound('Student profile');
  const now = new Date();

  // (a) period tags of not-yet-ended periods the student is allocated in.
  const periods = await diningQueries.findPeriods(
    { isArchived: false, endDate: { $gte: periodDay(now) } },
    { select: 'startDate endDate isArchived', lean: true }
  );
  const allocations = periods.length
    ? await allocationQueries.findAllocationsByUserAndPeriods(userId, periods.map((period) => period._id))
    : [];
  const allocatedIds = new Set(allocations.map((row) => idOf(row.periodId)));
  const myPeriods = periods.filter((period) => allocatedIds.has(idOf(period)));
  const periodById = new Map(myPeriods.map((period) => [idOf(period), period]));

  const [periodTags, formTags] = await Promise.all([
    myPeriods.length ? tagQueries.findPeriodTags(myPeriods.map((period) => period._id)) : [],
    // (b) standalone tags whose form is open now, for this student's audience.
    tagQueries.findOpenFormTags(now),
  ]);
  const standalone = formTags.filter((tag) => inAudience(tag, profile));
  const tags = [...periodTags, ...standalone];
  const values = await tagQueries.findStudentValues(userId, tags.map((tag) => tag._id));
  const valueByTag = new Map(values.map((row) => [idOf(row.tagId), row]));

  const items = [
    ...periodTags
      .map((tag) => ({ tag, period: periodById.get(idOf(tag.periodId)) }))
      .sort((a, b) => new Date(a.period.startDate) - new Date(b.period.startDate) || (a.tag.order || 0) - (b.tag.order || 0))
      .map(({ tag, period }) => serializeItem(tag, { period, valueRow: valueByTag.get(idOf(tag)), ...periodItemState(period, now) })),
    ...standalone.map((tag) => serializeItem(tag, {
      valueRow: valueByTag.get(idOf(tag)),
      editable: true,
      editableUntil: new Date(tag.form.closesAt),
    })),
  ];
  return success({ items });
};

export const answerStudentDiningTag = async (userId, tagId, payload = {}) => {
  if (!mongoose.Types.ObjectId.isValid(tagId)) return badRequest('Invalid tag');
  if (typeof payload?.value !== 'boolean') return badRequest('Answer yes or no');
  const [profile, tag] = await Promise.all([
    studentProfileQueries.findByUserId(userId, { select: '_id rollNumber status', lean: true }),
    tagQueries.findTagById(tagId),
  ]);
  if (!profile) return notFound('Student profile');
  if (!tag || tag.isArchived) return notFound('Dining tag');
  const now = new Date();

  let period = null;
  let state;
  if (tag.kind === 'period') {
    period = tag.periodId ? await diningQueries.findPeriodById(tag.periodId, { select: 'startDate endDate isArchived', lean: true }) : null;
    if (!period || period.isArchived) return badRequest('This dining period is no longer available');
    const allocation = await allocationQueries.findAllocation(period._id, userId);
    if (!allocation) return badRequest('You are not allocated in this dining period');
    state = periodItemState(period, now);
    if (!state.editable) return badRequest('Answers can no longer be changed once the dining period has started');
  } else {
    if (!isFormOpen(tag, now)) return badRequest('This form is not open');
    if (!inAudience(tag, profile)) return badRequest('This form is not open for you');
    state = { editable: true, editableUntil: new Date(tag.form.closesAt) };
  }

  const valueRow = await tagOwner.setValue({
    tagId: tag._id,
    studentUserId: userId,
    studentProfileId: profile._id,
    rollNumber: profile.rollNumber,
    value: payload.value,
    source: 'student',
    updatedBy: userId,
  });
  return success(serializeItem(tag, { period, valueRow, ...state }), 200, 'Answer saved');
};

export default { listStudentDiningTags, answerStudentDiningTag, getSelectionQuestions, validateSelectionAnswers };
