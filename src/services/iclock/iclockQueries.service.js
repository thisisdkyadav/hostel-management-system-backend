/**
 * iclock Queries Service — the only READ surface for the iclock collections.
 */
import { IclockCommand, IclockDevice, IclockDeviceUser, IclockPunch, IclockRequestLog } from "../../models/index.js"

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

  /** Per-machine counts for the machines page: punches since `since`, command states. */
  async machineStats(since) {
    const [punches, commands, recent] = await Promise.all([
      IclockPunch.aggregate([{ $match: { receivedAt: { $gte: since } } }, { $group: { _id: "$sn", n: { $sum: 1 } } }]),
      IclockCommand.aggregate([
        { $match: { $or: [{ status: { $in: ["queued", "sent"] } }, { status: "failed", doneAt: { $gte: since } }] } },
        { $group: { _id: { sn: "$sn", status: "$status" }, n: { $sum: 1 } } },
      ]),
      // Realtime punches arrive within seconds, so (machine time − received time) ≈ clock offset.
      IclockPunch.aggregate([
        { $match: { receivedAt: { $gte: new Date(Date.now() - 24 * 3600e3) } } },
        { $sort: { receivedAt: -1 } },
        { $group: { _id: "$sn", diffs: { $push: { $subtract: ["$punchedAt", "$receivedAt"] } } } },
        { $project: { diffs: { $slice: ["$diffs", 20] } } },
      ]),
    ])
    return { punches, commands, recent }
  },

  async countOutstandingCommands(sn) {
    return IclockCommand.countDocuments({ sn, status: { $in: ["queued", "sent"] } })
  },

  async listSyncDevices() {
    return IclockDevice.find({ "sync.enabled": true }).lean()
  },

  // ---- Roster ----

  /** What each of these machines holds for every person (or one pin), for the scanner-photo page. */
  async listRosterStates(sns, { pin } = {}) {
    return IclockDeviceUser.find({ sn: { $in: sns }, ...(pin ? { pin } : {}) })
      .select("sn pin onMachine faceSha pending.op lastResult")
      .lean()
  },

  async listRoster(sn) {
    return IclockDeviceUser.find({ sn }).select("pin name onMachine source faceSha pending lastResult").lean()
  },

  async countRoster(sn) {
    return IclockDeviceUser.countDocuments({ sn })
  },

  async findRosterPerson(sn, pin) {
    return IclockDeviceUser.findOne({ sn, pin }).lean()
  },

  async listRosterFailures(sn, limit = 50) {
    return IclockDeviceUser.find({ sn, "lastResult.ok": false }).sort({ "lastResult.at": -1 }).limit(limit).lean()
  },

  async findCommand(sn, commandId) {
    return IclockCommand.findOne({ sn, commandId }).lean()
  },

  /** Saved ERRORLOG uploads, oldest first (replaying errors that arrived before HMS read them). */
  async listErrorLogUploads() {
    return IclockRequestLog.find({ method: "POST", path: "cdata", query: /table=ERRORLOG/i }).select("sn body at").sort({ at: 1 }).lean()
  },

  async listRequestLogs({ sn, limit = 100 } = {}) {
    return IclockRequestLog.find(sn ? { sn } : {}).sort({ at: -1 }).limit(limit).lean()
  },
}

export default iclockQueries
