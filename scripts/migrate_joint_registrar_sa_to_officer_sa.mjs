import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"

const OLD_SUBROLE = "Joint Registrar SA"
const NEW_SUBROLE = "Officer SA"
const OLD_STATUS = "pending_joint_registrar"
const NEW_STATUS = "pending_officer"
const APPLY = process.argv.includes("--apply")
const VERBOSE = process.argv.includes("--verbose")
const BATCH_SIZE = 200

const COLLECTION_MIGRATIONS = [
  {
    label: "users.subRole",
    collection: "users",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: ["subRole"],
    query: { subRole: OLD_SUBROLE },
  },
  {
    label: "jrappointments.targetSubRole",
    collection: "jrappointments",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: ["targetSubRole"],
    query: { targetSubRole: OLD_SUBROLE },
  },
  {
    label: "eventproposals.approverStages",
    collection: "eventproposals",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: ["currentApprovalStage", "customApprovalChain", "customApprovalAssignments[].stage"],
    query: {
      $or: [
        { currentApprovalStage: OLD_SUBROLE },
        { customApprovalChain: OLD_SUBROLE },
        { "customApprovalAssignments.stage": OLD_SUBROLE },
      ],
    },
  },
  {
    label: "eventproposals.status",
    collection: "eventproposals",
    oldValue: OLD_STATUS,
    newValue: NEW_STATUS,
    paths: ["status"],
    query: { status: OLD_STATUS },
  },
  {
    label: "activitycalendars.approverStages",
    collection: "activitycalendars",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: ["currentApprovalStage", "customApprovalChain", "customApprovalAssignments[].stage"],
    query: {
      $or: [
        { currentApprovalStage: OLD_SUBROLE },
        { customApprovalChain: OLD_SUBROLE },
        { "customApprovalAssignments.stage": OLD_SUBROLE },
      ],
    },
  },
  {
    label: "activitycalendars.status",
    collection: "activitycalendars",
    oldValue: OLD_STATUS,
    newValue: NEW_STATUS,
    paths: ["status"],
    query: { status: OLD_STATUS },
  },
  {
    label: "eventexpenses.approverStages",
    collection: "eventexpenses",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: ["currentApprovalStage", "customApprovalChain", "customApprovalAssignments[].stage"],
    query: {
      $or: [
        { currentApprovalStage: OLD_SUBROLE },
        { customApprovalChain: OLD_SUBROLE },
        { "customApprovalAssignments.stage": OLD_SUBROLE },
      ],
    },
  },
  {
    label: "eventexpenses.approvalStatus",
    collection: "eventexpenses",
    oldValue: OLD_STATUS,
    newValue: NEW_STATUS,
    paths: ["approvalStatus"],
    query: { approvalStatus: OLD_STATUS },
  },
  {
    label: "porrequests.approverStages",
    collection: "porrequests",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: ["currentApprovalStage", "customApprovalChain", "customApprovalAssignments[].stage"],
    query: {
      $or: [
        { currentApprovalStage: OLD_SUBROLE },
        { customApprovalChain: OLD_SUBROLE },
        { "customApprovalAssignments.stage": OLD_SUBROLE },
      ],
    },
  },
  {
    label: "porrequests.status",
    collection: "porrequests",
    oldValue: OLD_STATUS,
    newValue: NEW_STATUS,
    paths: ["status"],
    query: { status: OLD_STATUS },
  },
  {
    label: "approvallogs.stage",
    collection: "approvallogs",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: ["stage"],
    query: { stage: OLD_SUBROLE },
  },
  {
    label: "megaeventoccurrences.approverStages",
    collection: "megaeventoccurrences",
    oldValue: OLD_SUBROLE,
    newValue: NEW_SUBROLE,
    paths: [
      "proposal.currentApprovalStage",
      "proposal.customApprovalChain",
      "proposal.customApprovalAssignments[].stage",
      "proposal.history[].stage",
      "expense.currentApprovalStage",
      "expense.customApprovalChain",
      "expense.customApprovalAssignments[].stage",
      "expense.history[].stage",
    ],
    query: {
      $or: [
        { "proposal.currentApprovalStage": OLD_SUBROLE },
        { "proposal.customApprovalChain": OLD_SUBROLE },
        { "proposal.customApprovalAssignments.stage": OLD_SUBROLE },
        { "proposal.history.stage": OLD_SUBROLE },
        { "expense.currentApprovalStage": OLD_SUBROLE },
        { "expense.customApprovalChain": OLD_SUBROLE },
        { "expense.customApprovalAssignments.stage": OLD_SUBROLE },
        { "expense.history.stage": OLD_SUBROLE },
      ],
    },
  },
  {
    label: "megaeventoccurrences.statuses",
    collection: "megaeventoccurrences",
    oldValue: OLD_STATUS,
    newValue: NEW_STATUS,
    paths: ["proposal.status", "expense.approvalStatus"],
    query: {
      $or: [{ "proposal.status": OLD_STATUS }, { "expense.approvalStatus": OLD_STATUS }],
    },
  },
]

const splitPath = (path) => path.replace(/\[\]/g, ".[]").split(".")

const replaceValueAtPath = (node, tokens, oldValue, newValue) => {
  if (!node || !tokens.length) {
    return 0
  }

  const [token, ...rest] = tokens

  if (token === "[]") {
    if (!Array.isArray(node)) {
      return 0
    }

    return node.reduce((count, item) => count + replaceValueAtPath(item, rest, oldValue, newValue), 0)
  }

  if (rest.length === 0) {
    if (!(token in node)) {
      return 0
    }

    if (Array.isArray(node[token])) {
      let replacements = 0

      node[token] = node[token].map((item) => {
        if (item === oldValue) {
          replacements += 1
          return newValue
        }

        return item
      })

      return replacements
    }

    if (node[token] === oldValue) {
      node[token] = newValue
      return 1
    }

    return 0
  }

  return replaceValueAtPath(node[token], rest, oldValue, newValue)
}

const formatCollectionSummary = ({ label, collection, matchedCount, modifiedCount, replacementCount }) =>
  `${label || collection}: matched ${matchedCount}, modified ${modifiedCount}, replacements ${replacementCount}`

const runMigrationForCollection = async (db, migration) => {
  const collection = db.collection(migration.collection)
  const oldValue = migration.oldValue ?? OLD_SUBROLE
  const newValue = migration.newValue ?? NEW_SUBROLE
  const matchedCount = await collection.countDocuments(migration.query)

  if (matchedCount === 0) {
    return {
      label: migration.label,
      collection: migration.collection,
      matchedCount,
      modifiedCount: 0,
      replacementCount: 0,
    }
  }

  const cursor = collection.find(migration.query)
  const operations = []
  let modifiedCount = 0
  let replacementCount = 0

  while (await cursor.hasNext()) {
    const document = await cursor.next()

    if (!document) {
      continue
    }

    const documentReplacementCount = migration.paths.reduce(
      (count, path) => count + replaceValueAtPath(document, splitPath(path), oldValue, newValue),
      0
    )

    if (documentReplacementCount === 0) {
      continue
    }

    modifiedCount += 1
    replacementCount += documentReplacementCount

    if (APPLY) {
      operations.push({
        replaceOne: {
          filter: { _id: document._id },
          replacement: document,
        },
      })

      if (operations.length >= BATCH_SIZE) {
        await collection.bulkWrite(operations, { ordered: false })
        operations.length = 0
      }
    }
  }

  if (APPLY && operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false })
  }

  return {
    label: migration.label,
    collection: migration.collection,
    matchedCount,
    modifiedCount,
    replacementCount,
  }
}

const verifyRemainingMatches = async (db) => {
  const remaining = []

  for (const migration of COLLECTION_MIGRATIONS) {
    const count = await db.collection(migration.collection).countDocuments(migration.query)

    if (count > 0) {
      remaining.push({ collection: migration.collection, count })
    }
  }

  return remaining
}

const main = async () => {
  console.log(
    APPLY
      ? `Applying migrations: ${OLD_SUBROLE} -> ${NEW_SUBROLE}; ${OLD_STATUS} -> ${NEW_STATUS}`
      : `Dry run: ${OLD_SUBROLE} -> ${NEW_SUBROLE}; ${OLD_STATUS} -> ${NEW_STATUS}`
  )

  await connectDatabase()

  const db = mongoose.connection.db
  if (!db) {
    throw new Error("Mongo database handle is unavailable after connection")
  }

  const results = []

  for (const migration of COLLECTION_MIGRATIONS) {
    const result = await runMigrationForCollection(db, migration)
    results.push(result)
    console.log(formatCollectionSummary(result))

    if (VERBOSE && result.matchedCount > 0) {
      console.log(`  paths: ${migration.paths.join(", ")}`)
    }
  }

  const totalMatched = results.reduce((sum, result) => sum + result.matchedCount, 0)
  const totalModified = results.reduce((sum, result) => sum + result.modifiedCount, 0)
  const totalReplacements = results.reduce((sum, result) => sum + result.replacementCount, 0)

  console.log(`Totals: matched ${totalMatched}, modified ${totalModified}, replacements ${totalReplacements}`)

  if (APPLY) {
    const remaining = await verifyRemainingMatches(db)

    if (remaining.length > 0) {
      console.log("Remaining matches detected after apply:")
      for (const entry of remaining) {
        console.log(`  ${entry.collection}: ${entry.count}`)
      }
      process.exitCode = 1
    } else {
      console.log("Migration completed with no remaining matches in targeted collections.")
    }
  } else {
    console.log("No data changed. Re-run with --apply to perform the migration.")
  }
}

try {
  await main()
} finally {
  await mongoose.disconnect()
}
