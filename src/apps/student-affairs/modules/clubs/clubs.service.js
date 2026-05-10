import { BaseService } from "../../../../services/base/BaseService.js"
import {
  badRequest,
  conflict,
  created,
  forbidden,
  notFound,
  success,
} from "../../../../services/base/ServiceResponse.js"
import Club from "../../../../models/club/Club.model.js"
import User from "../../../../models/user/User.model.js"
import Gymkhana from "../../../../models/user/Gymkhana.model.js"
import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"
import {
  getGlobalGymkhanaCategoryDefinitions,
  normalizeCategoryKey,
} from "../events/category-definitions.utils.js"

const normalizeText = (value = "") => String(value || "").trim()

const normalizeEmail = (value = "") => normalizeText(value).toLowerCase()

const CLUB_DENY_ROUTES = [
  "route.gymkhana.dashboard",
  "route.gymkhana.events",
  "route.gymkhana.megaEvents",
  "route.gymkhana.elections",
]

const CLUB_ALLOW_ROUTES = [
  "route.gymkhana.club",
  "route.gymkhana.por",
  "route.gymkhana.profile",
]

const buildCategoryLookup = async () => {
  const gymkhanaCategories = await getGlobalGymkhanaCategoryDefinitions()
  const categoriesByKey = new Map()
  const categoriesByLabel = new Map()

  for (const category of gymkhanaCategories) {
    const key = normalizeCategoryKey(category?.key)
    if (!key) continue

    const label = normalizeText(category?.label) || key
    categoriesByKey.set(key, label)
    categoriesByLabel.set(label.toLowerCase(), key)
  }

  return {
    gymkhanaCategories: gymkhanaCategories.map((category) => ({
      key: normalizeCategoryKey(category?.key),
      label: normalizeText(category?.label) || normalizeCategoryKey(category?.key),
    })).filter((category) => category.key && category.label),
    categoriesByKey,
    categoriesByLabel,
  }
}

const serializeClub = (club, categoriesByKey) => {
  const source = typeof club?.toObject === "function" ? club.toObject() : club
  const gymkhanaCategoryKey = normalizeCategoryKey(source?.gymkhanaCategoryKey)

  return {
    id: String(source?._id || source?.id || ""),
    userId: source?.userId ? String(source.userId) : "",
    name: normalizeText(source?.name),
    email: normalizeEmail(source?.email),
    gymkhanaCategoryKey,
    gymkhanaCategoryLabel: categoriesByKey.get(gymkhanaCategoryKey) || gymkhanaCategoryKey,
    createdAt: source?.createdAt || null,
    updatedAt: source?.updatedAt || null,
  }
}

class ClubsService extends BaseService {
  constructor() {
    super(Club, "Club")
  }

  async listClubs() {
    const { gymkhanaCategories, categoriesByKey } = await buildCategoryLookup()
    const clubs = await this.model.find().sort({ name: 1 }).lean()

    return success(
      {
        clubs: clubs.map((club) => serializeClub(club, categoriesByKey)),
        gymkhanaCategories,
      },
      200,
      "Clubs loaded successfully"
    )
  }

  async createClub(data) {
    const categoryResolution = await this.resolveCategoryKey(data?.gymkhanaCategoryKey)
    if (!categoryResolution.success) {
      return badRequest(categoryResolution.message)
    }

    const normalizedName = normalizeText(data?.name)
    const normalizedEmail = normalizeEmail(data?.email)

    const duplicateClub = await this.model.findOne({
      $or: [{ nameLower: normalizedName.toLowerCase() }, { emailLower: normalizedEmail }],
    }).select("+nameLower +emailLower")
    if (duplicateClub) {
      if (duplicateClub.emailLower === normalizedEmail) {
        return conflict("A club with this email already exists")
      }
      return conflict("A club with this name already exists")
    }

    const existingUser = await User.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
    })
      .select("_id")
      .lean()
    if (existingUser) {
      return conflict("A user with this email already exists")
    }

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      role: ROLES.GYMKHANA,
      subRole: SUBROLES.CLUB,
      authz: {
        override: {
          allowRoutes: CLUB_ALLOW_ROUTES,
          denyRoutes: CLUB_DENY_ROUTES,
          allowCapabilities: [],
          denyCapabilities: [],
          constraints: [],
        },
      },
    })

    try {
      const club = await this.model.create({
        name: normalizedName,
        nameLower: normalizedName.toLowerCase(),
        email: normalizedEmail,
        emailLower: normalizedEmail,
        userId: user._id,
        gymkhanaCategoryKey: categoryResolution.key,
      })

      await Gymkhana.create({
        userId: user._id,
        categories: [categoryResolution.key],
        position: SUBROLES.CLUB,
      })

      return created(
        {
          club: serializeClub(club, categoryResolution.categoriesByKey),
        },
        "Club created successfully"
      )
    } catch (error) {
      await this.model.deleteOne({ userId: user._id })
      await User.findByIdAndDelete(user._id)
      throw error
    }
  }

  async updateClub(id, data) {
    const club = await this.model.findById(id).select("+nameLower +emailLower")
    if (!club) {
      return notFound("Club")
    }

    const linkedUser = await User.findById(club.userId)
      .select("_id email name role subRole")
      .lean()
    if (!linkedUser) {
      return notFound("Club login user")
    }

    if (linkedUser.role !== ROLES.GYMKHANA || linkedUser.subRole !== SUBROLES.CLUB) {
      return badRequest("Linked club login is not configured correctly")
    }

    if (data?.name !== undefined) {
      const normalizedName = normalizeText(data.name)
      const normalizedNameLower = normalizedName.toLowerCase()

      if (normalizedNameLower !== club.nameLower) {
        const existingByName = await this.model.findOne({
          _id: { $ne: club._id },
          nameLower: normalizedNameLower,
        })
        if (existingByName) {
          return conflict("A club with this name already exists")
        }
      }

      club.name = normalizedName
      club.nameLower = normalizedNameLower
    }

    if (data?.email !== undefined) {
      const normalizedEmail = normalizeEmail(data.email)

      if (normalizedEmail !== club.emailLower) {
        const existingByEmail = await this.model.findOne({
          _id: { $ne: club._id },
          emailLower: normalizedEmail,
        })
        if (existingByEmail) {
          return conflict("A club with this email already exists")
        }
      }

      const existingUserWithEmail = await User.findOne({
        _id: { $ne: linkedUser._id },
        email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
      })
        .select("_id")
        .lean()
      if (existingUserWithEmail) {
        return conflict("A user with this email already exists")
      }

      club.email = normalizedEmail
      club.emailLower = normalizedEmail
    }

    let categoriesByKey = new Map()
    let nextGymkhanaCategoryKey = null
    if (data?.gymkhanaCategoryKey !== undefined) {
      const categoryResolution = await this.resolveCategoryKey(data.gymkhanaCategoryKey)
      if (!categoryResolution.success) {
        return badRequest(categoryResolution.message)
      }

      club.gymkhanaCategoryKey = categoryResolution.key
      nextGymkhanaCategoryKey = categoryResolution.key
      categoriesByKey = categoryResolution.categoriesByKey
    }

    await club.save()

    const userUpdateData = {}
    if (data?.name !== undefined) {
      userUpdateData.name = club.name
    }
    if (data?.email !== undefined) {
      userUpdateData.email = club.email
    }
    if (Object.keys(userUpdateData).length > 0) {
      await User.updateOne({ _id: linkedUser._id }, userUpdateData)
    }

    if (nextGymkhanaCategoryKey) {
      await Gymkhana.updateOne(
        { userId: linkedUser._id },
        { categories: [nextGymkhanaCategoryKey], position: SUBROLES.CLUB },
        { upsert: true }
      )
    }

    if (categoriesByKey.size === 0) {
      const categoryLookup = await buildCategoryLookup()
      categoriesByKey = categoryLookup.categoriesByKey
    }

    return success(
      {
        club: serializeClub(club, categoriesByKey),
      },
      200,
      "Club updated successfully"
    )
  }

  async getMyClub(user) {
    if (user?.role !== ROLES.GYMKHANA || user?.subRole !== SUBROLES.CLUB) {
      return forbidden("Only club accounts can access this route")
    }

    const { categoriesByKey } = await buildCategoryLookup()
    const club = await this.model.findOne({ userId: user._id }).lean()
    if (!club) {
      return notFound("Club")
    }

    return success(
      {
        club: serializeClub(club, categoriesByKey),
      },
      200,
      "Club loaded successfully"
    )
  }

  async resolveCategoryKey(rawValue) {
    const normalizedInput = normalizeText(rawValue)
    if (!normalizedInput) {
      return {
        success: false,
        message: "GS category is required",
      }
    }

    const { categoriesByKey, categoriesByLabel } = await buildCategoryLookup()
    const normalizedKeyCandidate = normalizeCategoryKey(normalizedInput)

    if (normalizedKeyCandidate && categoriesByKey.has(normalizedKeyCandidate)) {
      return {
        success: true,
        key: normalizedKeyCandidate,
        categoriesByKey,
      }
    }

    const resolvedKey = categoriesByLabel.get(normalizedInput.toLowerCase())
    if (!resolvedKey) {
      return {
        success: false,
        message: "Select a valid GS category",
      }
    }

    return {
      success: true,
      key: resolvedKey,
      categoriesByKey,
    }
  }
}

export const clubsService = new ClubsService()
export default clubsService
