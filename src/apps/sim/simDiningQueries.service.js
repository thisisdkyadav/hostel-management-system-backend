import {
  SimCaterer,
  SimDiningAllocation,
  SimDiningBillingAccount,
  SimDiningPeriod,
  SimDiningRebate,
} from './sim.models.js';

const CATERER_POPULATE = { path: 'catererId', select: 'name email' };

export const simDiningQueries = {
  async findOnePeriod(filter, { select, lean, sort, populate, session } = {}) {
    let query = SimDiningPeriod.findOne(filter);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (sort) query = query.sort(sort);
    if (session) query = query.session(session);
    if (lean) query = query.lean();
    return query;
  },

  async findUserAllocationsByPeriods(studentUserId, periodIds) {
    return SimDiningAllocation.find({ periodId: { $in: periodIds }, studentUserId })
      .populate(CATERER_POPULATE)
      .lean();
  },

  async findRebatesByUser(studentUserId) {
    return SimDiningRebate.find({ studentUserId }).sort({ createdAt: -1 }).limit(100).lean();
  },

  async findBillingByUser(studentUserId) {
    return SimDiningBillingAccount.find({ studentUserId }).sort({ createdAt: -1 }).limit(50).lean();
  },

  async countCaterers() {
    return SimCaterer.countDocuments({});
  },

  async listCaterers() {
    return SimCaterer.find({ isArchived: false }).select('name email').lean();
  },
};

export default simDiningQueries;
