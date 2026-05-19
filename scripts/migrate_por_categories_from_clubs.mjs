import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { porService } from "../src/apps/student-affairs/modules/por/por.service.js"
import { POR_STATUS } from "../src/apps/student-affairs/modules/por/por.constants.js"
import Club from "../src/models/club/Club.model.js"
import PorCategory from "../src/models/club/PorCategory.model.js"
import PorRequest from "../src/models/club/PorRequest.model.js"

const APPLY = process.argv.includes("--apply")
const VERBOSE = process.argv.includes("--verbose")

const buildRequestsNeedingMigrationQuery = () => ({
  $or: [
    { porCategoryId: null },
    { gymkhanaApprovalSteps: { $exists: false } },
    { gymkhanaApprovalSteps: { $size: 0 } },
    {
      status: {
        $in: [
          POR_STATUS.PENDING_CLUB,
          POR_STATUS.PENDING_GS,
          POR_STATUS.PENDING_PRESIDENT,
        ],
      },
    },
  ],
})

const getMigrationSnapshot = async () => {
  const clubs = await Club.find().select("_id name").lean()
  const clubLinkedCategories = await PorCategory.find({ legacyClubId: { $ne: null } })
    .select("_id name legacyClubId")
    .lean()

  const categoriesByClubId = new Map(
    clubLinkedCategories
      .filter((category) => category.legacyClubId)
      .map((category) => [String(category.legacyClubId), category])
  )

  const missingClubCategories = clubs.filter((club) => !categoriesByClubId.has(String(club._id)))
  const requestsNeedingMigration = await PorRequest.countDocuments(buildRequestsNeedingMigrationQuery())

  return {
    totalClubs: clubs.length,
    clubLinkedCategoryCount: clubLinkedCategories.length,
    missingClubCategories,
    requestsNeedingMigration,
  }
}

const run = async () => {
  await connectDatabase()

  try {
    const before = await getMigrationSnapshot()

    console.log("POR category migration summary")
    console.log(`- Clubs: ${before.totalClubs}`)
    console.log(`- Existing club-linked POR categories: ${before.clubLinkedCategoryCount}`)
    console.log(`- Clubs missing categories: ${before.missingClubCategories.length}`)
    console.log(`- POR requests needing backfill: ${before.requestsNeedingMigration}`)

    if (VERBOSE && before.missingClubCategories.length > 0) {
      console.log("")
      console.log("Missing categories:")
      before.missingClubCategories.forEach((club) => {
        console.log(`- ${club.name} (${club._id})`)
      })
    }

    if (!APPLY) {
      console.log("")
      console.log("Dry run only. Re-run with --apply to create categories and backfill requests.")
      return
    }

    const categorySyncResult = await porService.syncClubLinkedPorCategories({
      updateExisting: true,
    })

    const cursor = PorRequest.find(buildRequestsNeedingMigrationQuery()).cursor()
    let migratedRequestCount = 0

    for await (const request of cursor) {
      await porService.migrateLegacyRequestIfNeeded(request)
      migratedRequestCount += 1
    }

    const after = await getMigrationSnapshot()
    const createdCategoryCount = after.clubLinkedCategoryCount - before.clubLinkedCategoryCount

    console.log("")
    console.log("Migration applied successfully")
    console.log(`- POR categories created from clubs: ${createdCategoryCount}`)
    console.log(`- Club-linked categories updated to current club -> GS -> President flow: ${categorySyncResult.updated}`)
    console.log(`- POR requests backfilled: ${migratedRequestCount}`)
    console.log(`- Clubs still missing categories: ${after.missingClubCategories.length}`)
    console.log(`- POR requests still needing backfill: ${after.requestsNeedingMigration}`)
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("POR category migration failed:", error)
  mongoose.disconnect().finally(() => {
    process.exit(1)
  })
})
