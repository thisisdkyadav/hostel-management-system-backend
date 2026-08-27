/**
 * Isolated mongoose models for the dining HTTP simulator.
 * Collection names are sim_* so live dining data is never touched.
 */
import mongoose from 'mongoose';

const SimCatererSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'sim_caterers' },
);

const SimDiningPeriodSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    registrationEnabled: { type: Boolean, default: true },
    allocationStartAt: { type: Date, default: null },
    allocationEndAt: { type: Date, default: null },
    catererIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'SimCaterer', default: [] },
    catererCapacities: {
      type: [
        {
          catererId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimCaterer', required: true },
          maxStudentCount: { type: Number, required: true, min: 1 },
          allocatedCount: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
    mealSlots: {
      type: [{ name: String, startTime: String, endTime: String }],
      default: [
        { name: 'Breakfast', startTime: '07:00', endTime: '10:00' },
        { name: 'Lunch', startTime: '12:00', endTime: '15:00' },
        { name: 'Dinner', startTime: '19:00', endTime: '22:00' },
      ],
    },
    dailyRate: { type: Number, default: 0, min: 0 },
    rebateSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
    eligibilityMode: { type: String, enum: ['all-active', 'custom'], default: 'all-active' },
    eligibleRollNumbers: { type: [String], default: [] },
    eligibleStudentCount: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'sim_diningperiods' },
);

const SimDiningAllocationSchema = new mongoose.Schema(
  {
    periodId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimDiningPeriod', required: true },
    studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    rollNumber: { type: String, required: true, trim: true, uppercase: true },
    catererId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimCaterer', required: true },
    selectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'sim_diningallocations' },
);

SimDiningAllocationSchema.index({ periodId: 1, studentUserId: 1 }, { unique: true });
SimDiningAllocationSchema.index({ periodId: 1, catererId: 1 });

const SimDiningRebateSchema = new mongoose.Schema(
  {
    studentUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    periodId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, default: 'approved' },
  },
  { timestamps: true, collection: 'sim_diningrebates' },
);

const SimDiningBillingSchema = new mongoose.Schema(
  {
    studentUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    periodId: { type: mongoose.Schema.Types.ObjectId, default: null },
    amount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'sim_diningbillingaccounts' },
);

export const SimCaterer = mongoose.models.SimCaterer || mongoose.model('SimCaterer', SimCatererSchema);
export const SimDiningPeriod =
  mongoose.models.SimDiningPeriod || mongoose.model('SimDiningPeriod', SimDiningPeriodSchema);
export const SimDiningAllocation =
  mongoose.models.SimDiningAllocation || mongoose.model('SimDiningAllocation', SimDiningAllocationSchema);
export const SimDiningRebate =
  mongoose.models.SimDiningRebate || mongoose.model('SimDiningRebate', SimDiningRebateSchema);
export const SimDiningBillingAccount =
  mongoose.models.SimDiningBillingAccount || mongoose.model('SimDiningBillingAccount', SimDiningBillingSchema);
