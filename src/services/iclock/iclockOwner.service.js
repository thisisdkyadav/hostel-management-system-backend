/**
 * iclock Owner Service — the only WRITE surface for the iclock collections
 * (IclockDevice, IclockCommand, IclockPunch, IclockRequestLog, IclockDeviceUser).
 */
import { IclockCommand, IclockDevice, IclockDeviceUser, IclockPunch, IclockRequestLog } from "../../models/index.js"

export const iclockOwner = {
  async ensureIndexes() {
    await Promise.all([IclockDevice, IclockCommand, IclockPunch, IclockRequestLog, IclockDeviceUser].map((m) => m.createIndexes()))
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

  /**
   * Commands the machine TOOK before `before` but never answered → failed.
   * Still-queued commands are left alone: an offline machine picks them up when it's back.
   */
  async failUnansweredCommands(sn, before) {
    const stale = await IclockCommand.find({ sn, status: "sent", sentAt: { $lt: before } })
      .select("commandId")
      .lean()
    if (!stale.length) return []
    const ids = stale.map((c) => c.commandId)
    await IclockCommand.updateMany(
      { sn, commandId: { $in: ids }, status: "sent" },
      { $set: { status: "failed", result: "no answer", doneAt: new Date() } },
    )
    return ids
  },

  // ---- Roster (who is on each machine) ----

  /** First-time seed: insert rows that don't exist yet, never touch existing ones. */
  async seedRoster(sn, rows) {
    if (!rows.length) return 0
    const result = await IclockDeviceUser.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { sn, pin: row.pin },
          update: { $setOnInsert: { sn, pin: row.pin, name: row.name || "", onMachine: true, source: row.source, faceSha: row.faceSha || "" } },
          upsert: true,
        },
      })),
      { ordered: false },
    )
    return result.upsertedCount || 0
  },

  /** The machine reported these people (USER records): they are on it. */
  async markOnMachine(sn, people) {
    if (!people.length) return 0
    const result = await IclockDeviceUser.bulkWrite(
      people.map(({ pin, name }) => ({
        updateOne: {
          filter: { sn, pin },
          update: {
            $set: { onMachine: true, ...(name ? { name } : {}) },
            $setOnInsert: { sn, pin, source: "machine", faceSha: "" },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    )
    return (result.upsertedCount || 0) + (result.modifiedCount || 0)
  },

  async setRosterPending(sn, pin, { op, commandIds, faceSha = "", name }) {
    return IclockDeviceUser.updateOne(
      { sn, pin },
      {
        $set: { pending: { op, commandIds, faceSha, at: new Date() }, ...(name !== undefined ? { name } : {}) },
        $setOnInsert: { sn, pin, onMachine: false, source: "hms", faceSha: "" },
      },
      { upsert: true },
    )
  },

  /**
   * The machine answered one roster command. `kind` is the command's ref.kind
   * (roster-user | roster-face | roster-remove). Returns the updated row.
   */
  async applyRosterResult(sn, pin, { kind, commandId, ok, code, error = "", message = "" }) {
    const row = await IclockDeviceUser.findOne({ sn, pin }).lean()
    if (!row) return null
    const set = {
      lastResult: { op: kind.replace("roster-", ""), ok, code, at: new Date(), faceSha: row.pending?.faceSha || "", commandId, error, message },
    }
    // "User added" says nothing about the photo: keep a photo error the machine already reported.
    if (kind === "roster-user" && row.lastResult?.error) delete set.lastResult
    // The machine's error for this very command already arrived (ERRORLOG before the answer): it stands.
    if (row.lastResult?.error && row.lastResult.commandId === commandId) delete set.lastResult
    if (ok && kind === "roster-user") set.onMachine = true
    if (ok && kind === "roster-face") set.faceSha = row.pending?.faceSha || ""
    if (ok && kind === "roster-remove") Object.assign(set, { onMachine: false, faceSha: "" })
    const remaining = (row.pending?.commandIds || []).filter((id) => id !== commandId)
    // A failed step ends the whole operation: the next sync run plans it again.
    set.pending = remaining.length && ok ? { ...row.pending, commandIds: remaining } : { op: "", commandIds: [], faceSha: "", at: null }
    return IclockDeviceUser.findOneAndUpdate({ sn, pin }, { $set: set }, { returnDocument: "after" }).lean()
  },

  /** The machine uploaded the photo it holds for this person (file saved by the caller). */
  async setMachinePhoto(sn, pin, { kind, sha256, size }) {
    return IclockDeviceUser.updateOne(
      { sn, pin },
      { $set: { machinePhoto: { kind, sha256, size, at: new Date() } }, $setOnInsert: { sn, pin, onMachine: true, source: "machine", faceSha: "" } },
      { upsert: true },
    )
  },

  /** Remember an ERRORLOG on its command. Returns the command (null when HMS never sent it). */
  async recordCommandError(sn, commandId, { code, message }) {
    return IclockCommand.findOneAndUpdate(
      { sn, commandId },
      { $set: { machineError: { code, message, at: new Date() } } },
      { returnDocument: "after" },
    ).lean()
  },

  /**
   * The machine took a photo command (Return=0, or not answered yet) and then
   * reported it couldn't use it. Only applies when that command is the one in
   * flight or the last one answered for this person, so a late or replayed
   * error never marks a newer photo as refused. Returns the updated row or null.
   */
  async applyMachineError(sn, pin, { commandId, error, message }) {
    const row = await IclockDeviceUser.findOne({ sn, pin }).lean()
    if (!row) return null
    const inFlight = (row.pending?.commandIds || []).includes(commandId)
    const last = row.lastResult || {}
    // Rows answered before commandId was recorded: the last answer must be a photo.
    const lastAnswer = last.commandId === commandId || (last.commandId == null && last.op === "face" && last.ok === true)
    if (!inFlight && !lastAnswer) return null
    const refusedSha = inFlight ? row.pending.faceSha : last.faceSha || row.faceSha
    if (!refusedSha) return null
    const set = {
      lastResult: { op: "face", ok: false, code: last.code ?? null, at: new Date(), faceSha: refusedSha, commandId, error, message },
    }
    // The machine has no usable face from this photo.
    if (row.faceSha === refusedSha) set.faceSha = ""
    if (inFlight) set.pending = { op: "", commandIds: [], faceSha: "", at: null }
    return IclockDeviceUser.findOneAndUpdate({ sn, pin }, { $set: set }, { returnDocument: "after" }).lean()
  },

  /** Pending operations that include an unanswered (failed) command are dropped so they get re-planned. */
  async clearRosterPendingFor(sn, commandIds) {
    if (!commandIds.length) return 0
    const result = await IclockDeviceUser.updateMany(
      { sn, "pending.op": { $ne: "" }, "pending.commandIds": { $in: commandIds } },
      { $set: { pending: { op: "", commandIds: [], faceSha: "", at: null }, lastResult: { op: "", ok: false, code: null, at: new Date() } } },
    )
    return result.modifiedCount || 0
  },

  async setSyncState(sn, set) {
    const prefixed = Object.fromEntries(Object.entries(set).map(([k, v]) => [`sync.${k}`, v]))
    return IclockDevice.findOneAndUpdate({ sn }, { $set: prefixed }, { returnDocument: "after" }).lean()
  },

  logRequest(entry) {
    return IclockRequestLog.create(entry)
  },
}

export default iclockOwner
