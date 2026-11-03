/**
 * iclock Queries Service — the only READ surface for the iclock collections.
 */
import { IclockCommand, IclockDevice, IclockPunch, IclockRequestLog } from "../../models/index.js"

export const iclockQueries = {
  async findDevice(sn) {
    return IclockDevice.findOne({ sn }).lean()
  },

  async listDevices() {
    return IclockDevice.find().sort({ sn: 1 }).lean()
  },

  async findQueuedCommands(sn, limit = 20) {
    return IclockCommand.find({ sn, status: "queued" }).sort({ commandId: 1 }).limit(limit).lean()
  },

  async listCommands({ sn, limit = 100 } = {}) {
    return IclockCommand.find(sn ? { sn } : {}).sort({ createdAt: -1 }).limit(limit).lean()
  },

  async listPunches({ sn, limit = 100 } = {}) {
    return IclockPunch.find(sn ? { sn } : {}).sort({ receivedAt: -1 }).limit(limit).lean()
  },

  async listRequestLogs({ sn, limit = 100 } = {}) {
    return IclockRequestLog.find(sn ? { sn } : {}).sort({ at: -1 }).limit(limit).lean()
  },
}

export default iclockQueries
