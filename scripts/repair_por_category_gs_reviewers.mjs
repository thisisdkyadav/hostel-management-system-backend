import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { porService } from "../src/apps/student-affairs/modules/por/por.service.js"
import PorCategory from "../src/models/club/PorCategory.model.js"
import PorRequest from "../src/models/club/PorRequest.model.js"

const APPLY = process.argv.includes("--apply")
const VERBOSE = process.argv.includes("--verbose")

const getSnapshot = async () => {
  const clubLinkedCategories = await PorCategory.find({ legacyClubId: { $ne: null } })
    .select("_id name legacyClubId gymkhanaSteps")
    .lean()

  const categoryIds = clubLinkedCategories.map((category) => category._id)
  const relatedRequestCount = categoryIds.length
    ? await PorRequest.countDocuments({ porCategoryId: { $in: categoryIds } })
    : 0

  return {
    clubLinkedCategories,
    relatedRequestCount,
  }
}

const run = async () => {
  await connectDatabase()

  try {
    const before = await getSnapshot()

    console.log("POR GS reviewer repair summary")
    console.log(`- Club-linked categories found: ${before.clubLinkedCategories.length}`)
    console.log(`- Requests linked to those categories: ${before.relatedRequestCount}`)

    if (VERBOSE && before.clubLinkedCategories.length > 0) {
      console.log("")
      console.log("Categories to repair:")
      before.clubLinkedCategories.forEach((category) => {
        console.log(`- ${category.name} (${category._id})`)
      })
    }

    if (!APPLY) {
      console.log("")
      console.log("Dry run only. Re-run with --apply to update categories and linked POR requests.")
      return
    }

    const categorySyncResult = await porService.syncClubLinkedPorCategories({
      updateExisting: true,
    })

    const refreshedCategories = await PorCategory.find({ legacyClubId: { $ne: null } })
      .select("_id name legacyGymkhanaCategoryKey gymkhanaSteps")
      .lean()
    const categoryById = new Map(
      refreshedCategories.map((category) => [String(category._id), category])
    )

    const cursor = PorRequest.find({
      porCategoryId: { $in: refreshedCategories.map((category) => category._id) },
    }).cursor()

    let updatedRequestCount = 0

    for await (const request of cursor) {
      const category = categoryById.get(String(request.porCategoryId || ""))
      if (!category) continue

      await porService.syncRequestWithPorCategoryDefinition(request, category)
      updatedRequestCount += 1
    }

    console.log("")
    console.log("Repair applied successfully")
    console.log(`- Club-linked categories updated: ${categorySyncResult.updated}`)
    console.log(`- Club-linked categories newly created: ${categorySyncResult.created}`)
    console.log(`- POR requests updated to corrected GS reviewers: ${updatedRequestCount}`)
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("POR GS reviewer repair failed:", error)
  mongoose.disconnect().finally(() => {
    process.exit(1)
  })
})
