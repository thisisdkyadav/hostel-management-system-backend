import { createAllocationOwner } from '../../services/dining/allocationOwner.service.js';
import {
  SimCaterer,
  SimDiningAllocation,
  SimDiningBillingAccount,
  SimDiningPeriod,
  SimDiningRebate,
} from './sim.models.js';

export const simAllocationOwner = createAllocationOwner({
  DiningPeriod: SimDiningPeriod,
  DiningAllocation: SimDiningAllocation,
});

export const simDiningOwner = {
  async createCaterer(data) {
    return SimCaterer.create(data);
  },

  async createPeriod(data) {
    return SimDiningPeriod.create(data);
  },

  async deleteDiningData() {
    const [caterers, periods, allocations, rebates, billing] = await Promise.all([
      SimCaterer.deleteMany({}),
      SimDiningPeriod.deleteMany({}),
      SimDiningAllocation.deleteMany({}),
      SimDiningRebate.deleteMany({}),
      SimDiningBillingAccount.deleteMany({}),
    ]);

    return {
      caterers: caterers.deletedCount || 0,
      periods: periods.deletedCount || 0,
      allocations: allocations.deletedCount || 0,
      rebates: rebates.deletedCount || 0,
      billing: billing.deletedCount || 0,
    };
  },
};

export default simDiningOwner;
