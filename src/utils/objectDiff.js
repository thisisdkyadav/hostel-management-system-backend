/**
 * Object diff helpers for the audit-log system.
 *
 * Kept deliberately small: shallow comparison over an explicit whitelist of
 * fields. Values may themselves be objects/arrays (e.g. budget line items);
 * those are compared structurally via a stable deep-equal so that order-stable
 * nested changes are detected without producing noisy false positives.
 */

/**
 * Deep structural equality. Handles primitives, Dates, arrays, and plain
 * objects. Not intended for class instances beyond Date.
 */
export const deepEqual = (a, b) => {
  if (a === b) return true

  if (a == null || b == null) return a === b

  // Dates
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : a
    const bt = b instanceof Date ? b.getTime() : b
    return at === bt
  }

  if (typeof a !== "object" || typeof b !== "object") return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => deepEqual(a[key], b[key]))
}

/**
 * Pick a subset of fields from a (possibly Mongoose) document into a plain
 * object snapshot. Pass `doc.toObject()` for Mongoose documents, or a plain
 * object. Missing fields are omitted.
 *
 * @param {object} source
 * @param {string[]} fields
 * @returns {object}
 */
export const pickFields = (source = {}, fields = []) => {
  const snapshot = {}
  if (!source) return snapshot
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      snapshot[field] = source[field]
    }
  }
  return snapshot
}

/**
 * Compute a field-level diff between two snapshots.
 *
 * @param {object} before
 * @param {object} after
 * @param {string[]} [fields] - Fields to compare. Defaults to the union of keys
 *   present in `before` and `after`.
 * @returns {Array<{ field: string, from: any, to: any }>} only changed fields.
 */
export const computeDiff = (before = {}, after = {}, fields = null) => {
  const keys =
    fields && fields.length
      ? fields
      : Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))

  const changes = []
  for (const field of keys) {
    const from = before ? before[field] : undefined
    const to = after ? after[field] : undefined
    if (!deepEqual(from, to)) {
      changes.push({
        field,
        from: from === undefined ? null : from,
        to: to === undefined ? null : to,
      })
    }
  }
  return changes
}

export default { deepEqual, pickFields, computeDiff }
