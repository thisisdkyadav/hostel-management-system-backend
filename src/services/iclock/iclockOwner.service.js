/**
 * iclock Owner Service — the only WRITE surface for the iclock collections
 * (IclockDevice, IclockCommand, IclockPunch, IclockRequestLog).
 */
import { IclockCommand, IclockDevice, IclockPunch, IclockRequestLog } from "../../models/index.js"

export const iclockOwner = {
  async ensureIndexes() {
    await Promise.all([IclockDevice, IclockCommand, IclockPunch, IclockRequestLog].map((m) => m.createIndexes()))
  },

  /** Upsert the machine on every request and return it (lean). */
  async touchDevice(sn, set = {}) {
    return IclockDevice.findOneAndUpdate(
      { sn },
      { $set: { lastSeenAt: new Date(), ...set }, $setOnInsert: { sn, firstSeenAt: new Date() } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean()
  },

  async setStamp(sn, table, stamp) {
    return IclockDevice.updateOne({ sn }, { $set: { [`stamps.${table}`]: String(stamp) } })
  },

  async updateDevice(sn, set) {
    return IclockDevice.findOneAndUpdate({ sn }, { $set: set }, { returnDocument: "after" }).lean()
  },

  /** Insert punches; duplicates (machine re-sends) are skipped, not errors. Returns inserted docs. */
  async insertPunches(docs) {
    if (!docs.length) return []
    try {
      return await IclockPunch.insertMany(docs, { ordered: false, lean: true })
    } catch (error) {
      if (error?.code !== 11000 && !error?.writeErrors) throw error
      return error.insertedDocs || []
    }
  },

  async setPunchOutcome(id, outcome) {
    return IclockPunch.updateOne({ _id: id }, { $set: { outcome } })
  },

  /** Queue a command; allocates the per-machine command id atomically. */
  async queueCommand({ sn, command, ref, createdBy = null }) {
    const device = await IclockDevice.findOneAndUpdate({ sn }, { $inc: { nextCommandId: 1 } }, { returnDocument: "after" }).lean()
    if (!device) throw new Error(`Unknown machine ${sn}`)
    const commandId = device.nextCommandId - 1
    return IclockCommand.create({ sn, commandId, command, ref, createdBy })
  },

  async markCommandsSent(sn, commandIds) {
    if (!commandIds.length) return
    await IclockCommand.updateMany(
      { sn, commandId: { $in: commandIds }, status: "queued" },
      { $set: { status: "sent", sentAt: new Date() } },
    )
  },

  async completeCommand(sn, { id, returnCode, cmd, extra }) {
    return IclockCommand.findOneAndUpdate(
      { sn, commandId: id },
      {
        $set: {
          status: returnCode === 0 ? "done" : "failed",
          returnCode,
          result: [cmd, ...Object.entries(extra || {}).map(([k, v]) => `${k}=${v}`)].filter(Boolean).join(" "),
          doneAt: new Date(),
        },
      },
      { returnDocument: "after" },
    ).lean()
  },

  logRequest(entry) {
    return IclockRequestLog.create(entry)
  },
}

export default iclockOwner
