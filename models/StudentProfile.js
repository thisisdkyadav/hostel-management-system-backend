import mongoose from "mongoose"

const StudentProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User ID is required"],
    unique: true,
    index: true,
  },
  rollNumber: {
    type: String,
    required: [true, "Roll number is required"],
    unique: true,
    trim: true,
    uppercase: true,
    index: true,
  },
  department: {
    type: String,
    trim: true,
  },
  degree: {
    type: String,
    trim: true,
  },
  admissionDate: {
    type: Date,
  },
  address: {
    type: String,
    trim: true,
  },
  dateOfBirth: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ["Male", "Female", "Other"],
    trim: true,
  },
  idCard: {
    // { front, back }
    type: Object,
    default: {
      front: "",
      back: "",
    },
  },
  guardian: {
    type: String,
    trim: true,
  },
  guardianPhone: {
    type: String,
    trim: true,
  },
  guardianEmail: {
    type: String,
  },
  currentRoomAllocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAllocation",
  },
  familyMembers: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "FamilyMember",
  },
  status: {
    type: String,
    enum: ["Active", "Graduated", "Dropped", "Inactive"],
    default: "Active",
  },
  isDayScholar: {
    type: Boolean,
    default: false,
  },
  dayScholarDetails: {
    type: {
      address: String,
      ownerName: String,
      ownerPhone: String,
      ownerEmail: String,
    },
  },
})

StudentProfileSchema.statics.getFullStudentData = async function (userId) {
  try {
    const isArray = Array.isArray(userId)
    const userIds = isArray ? userId : [userId]

    const studentProfiles = await this.find({ userId: { $in: userIds } })
      .populate({
        path: "userId",
        select: "name email phone profileImage",
      })
      .populate({
        path: "currentRoomAllocation",
        populate: [
          {
            path: "roomId",
            select: "roomNumber",
            populate: {
              path: "unitId",
              select: "unitNumber",
            },
          },
          {
            path: "hostelId",
            select: "name type",
          },
        ],
      })

    if (studentProfiles.length === 0) {
      return isArray ? [] : null
    }

    const formattedProfiles = studentProfiles.map((studentProfile) => {
      let year
      if (studentProfile.admissionDate) {
        const currentDate = new Date()
        const admissionYear = studentProfile.admissionDate.getFullYear()
        const currentYear = currentDate.getFullYear()
        const isNext = currentDate.getMonth() > 5 ? 1 : 0
        year = currentYear - admissionYear + isNext || ""
      }

      const formattedDOB = studentProfile.dateOfBirth ? studentProfile.dateOfBirth.toISOString().split("T")[0] : ""

      const fullData = {
        userId: studentProfile.userId?._id || "",
        id: studentProfile._id,
        name: studentProfile.userId?.name || "",
        email: studentProfile.userId?.email || "",
        phone: studentProfile.userId?.phone || "",
        profileImage: studentProfile.userId?.profileImage || "",
        rollNumber: studentProfile.rollNumber,
        department: studentProfile.department || "",
        degree: studentProfile.degree || "",
        year: year,
        gender: studentProfile.gender || "",
        dateOfBirth: formattedDOB,
        address: studentProfile.address || "",
        guardian: studentProfile.guardian || "",
        guardianEmail: studentProfile.guardianEmail || "",
        guardianPhone: studentProfile.guardianPhone || "",
        admissionDate: studentProfile.admissionDate,
        status: studentProfile.status || "",
        isDayScholar: studentProfile.isDayScholar || false,
        dayScholarDetails: studentProfile.dayScholarDetails || null,
      }

      if (studentProfile.currentRoomAllocation) {
        fullData.hostel = studentProfile.currentRoomAllocation.hostelId?.name || ""
        fullData.hostelId = studentProfile.currentRoomAllocation.hostelId?._id || ""
        fullData.unit = studentProfile.currentRoomAllocation.roomId?.unitId?.unitNumber || ""
        fullData.room = studentProfile.currentRoomAllocation.roomId?.roomNumber || ""
        fullData.bedNumber = studentProfile.currentRoomAllocation.bedNumber?.toString() || ""
        fullData.allocationId = studentProfile.currentRoomAllocation._id
        fullData.hostelType = studentProfile.currentRoomAllocation.hostelId?.type || ""
        fullData.displayRoom = studentProfile.currentRoomAllocation.roomId?.unitId?.unitNumber
          ? studentProfile.currentRoomAllocation.roomId?.unitId?.unitNumber + "-" + studentProfile.currentRoomAllocation.roomId?.roomNumber + "-" + studentProfile.currentRoomAllocation.bedNumber
          : studentProfile.currentRoomAllocation.roomId?.roomNumber + "-" + studentProfile.currentRoomAllocation.bedNumber
      }

      return fullData
    })

    return isArray ? formattedProfiles : formattedProfiles[0]
  } catch (error) {
    console.error("Error fetching full student data:", error)
    throw error
  }
}

StudentProfileSchema.statics.getBasicStudentData = async function (userId) {
  try {
    const isArray = Array.isArray(userId)
    const userIds = isArray ? userId : [userId]

    const studentProfiles = await this.find({ userId: { $in: userIds } })
      .populate({
        path: "userId",
        select: "name email phone profileImage",
      })
      .populate({
        path: "currentRoomAllocation",
        populate: [
          {
            path: "roomId",
            select: "roomNumber",
            populate: {
              path: "unitId",
              select: "unitNumber",
            },
          },
          {
            path: "hostelId",
            select: "name type",
          },
        ],
      })

    const formattedProfiles = studentProfiles.map((studentProfile) => {
      const fullData = {
        userId: studentProfile.userId?._id || "",
        id: studentProfile._id,
        name: studentProfile.userId?.name || "",
        email: studentProfile.userId?.email || "",
        phone: studentProfile.userId?.phone || "",
        profileImage: studentProfile.userId?.profileImage || "",
        rollNumber: studentProfile.rollNumber,
        gender: studentProfile.gender || "",
        status: studentProfile.status || "",
      }

      if (studentProfile.currentRoomAllocation) {
        fullData.hostel = studentProfile.currentRoomAllocation.hostelId?.name || ""
        fullData.displayRoom = studentProfile.currentRoomAllocation.roomId?.unitId?.unitNumber
          ? studentProfile.currentRoomAllocation.roomId?.unitId?.unitNumber + "-" + studentProfile.currentRoomAllocation.roomId?.roomNumber + "-" + studentProfile.currentRoomAllocation.bedNumber
          : studentProfile.currentRoomAllocation.roomId?.roomNumber + "-" + studentProfile.currentRoomAllocation.bedNumber
      }

      return fullData
    })

    return isArray ? formattedProfiles : formattedProfiles[0]
  } catch (error) {
    console.error("Error fetching full student data:", error)
    throw error
  }
}

StudentProfileSchema.statics.searchStudents = async function (params) {
  const { page = 1, limit = 10, name, email, rollNumber, department, degree, gender, hostelId, unitNumber, roomNumber, admissionDateFrom, admissionDateTo, hasAllocation, sortBy = "rollNumber", sortOrder = "asc", status } = params

  console.log(status)
  console.log(params)

  const pipeline = []

  const matchProfile = {}
  if (rollNumber) matchProfile.rollNumber = { $regex: rollNumber, $options: "i" }
  if (department) matchProfile.department = { $regex: department, $options: "i" }
  if (degree) matchProfile.degree = { $regex: degree, $options: "i" }
  if (gender) matchProfile.gender = gender
  if (admissionDateFrom || admissionDateTo) {
    matchProfile.admissionDate = {}
    if (admissionDateFrom) matchProfile.admissionDate.$gte = new Date(admissionDateFrom)
    if (admissionDateTo) matchProfile.admissionDate.$lte = new Date(admissionDateTo)
  }
  if (status) matchProfile.status = status
  pipeline.push({ $match: matchProfile })

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user",
    },
  })
  pipeline.push({ $unwind: "$user" })

  const matchUser = {}
  if (name) matchUser["user.name"] = { $regex: name, $options: "i" }
  if (email) matchUser["user.email"] = { $regex: email, $options: "i" }
  if (Object.keys(matchUser).length) {
    pipeline.push({ $match: matchUser })
  }

  if (hasAllocation === "true") {
    pipeline.push({ $match: { currentRoomAllocation: { $ne: null } } })
  } else if (hasAllocation === "false") {
    pipeline.push({ $match: { currentRoomAllocation: null } })
  }

  pipeline.push({
    $lookup: {
      from: "roomallocations",
      localField: "currentRoomAllocation",
      foreignField: "_id",
      as: "allocation",
    },
  })
  pipeline.push({
    $unwind: { path: "$allocation", preserveNullAndEmptyArrays: true },
  })

  pipeline.push({
    $lookup: {
      from: "rooms",
      localField: "allocation.roomId",
      foreignField: "_id",
      as: "room",
    },
  })
  pipeline.push({
    $unwind: { path: "$room", preserveNullAndEmptyArrays: true },
  })

  pipeline.push({
    $lookup: {
      from: "hostels",
      localField: "room.hostelId",
      foreignField: "_id",
      as: "hostel",
    },
  })
  pipeline.push({
    $unwind: { path: "$hostel", preserveNullAndEmptyArrays: true },
  })

  pipeline.push({
    $lookup: {
      from: "units",
      localField: "room.unitId",
      foreignField: "_id",
      as: "unit",
    },
  })
  pipeline.push({
    $unwind: { path: "$unit", preserveNullAndEmptyArrays: true },
  })

  const matchAllocation = {}
  if (hostelId) {
    const matchAllocation = {}
    if (hostelId) {
      matchAllocation["hostel._id"] = new mongoose.Types.ObjectId(hostelId)
    }
    if (unitNumber) {
      matchAllocation["unit.unitNumber"] = unitNumber
    }
    if (roomNumber) {
      matchAllocation["room.roomNumber"] = { $regex: roomNumber, $options: "i" }
    }
    if (Object.keys(matchAllocation).length) {
      pipeline.push({ $match: matchAllocation })
    }
  }
  if (unitNumber) {
    matchAllocation["unit.unitNumber"] = unitNumber
  }
  if (roomNumber) {
    matchAllocation["room.roomNumber"] = { $regex: roomNumber, $options: "i" }
  }
  if (Object.keys(matchAllocation).length) {
    pipeline.push({ $match: matchAllocation })
  }

  pipeline.push({
    $project: {
      id: "$_id",
      rollNumber: 1,
      gender: 1,
      userId: "$user._id",
      name: "$user.name",
      profileImage: "$user.profileImage",
      email: "$user.email",
      hostel: {
        $cond: {
          if: { $and: [{ $ne: ["$allocation", null] }, { $ne: ["$room", null] }, { $ne: ["$hostel", null] }] },
          then: "$hostel.name",
          else: null,
        },
      },
      displayRoom: {
        $cond: {
          if: { $and: [{ $ne: ["$allocation", null] }, { $ne: ["$room", null] }] },
          then: {
            $cond: {
              if: { $and: [{ $ne: ["$hostel", null] }, { $eq: ["$hostel.type", "unit-based"] }, { $ne: ["$unit", null] }] },
              then: { $concat: ["$unit.unitNumber", "-", "$room.roomNumber", "-", { $toString: "$allocation.bedNumber" }] },
              else: { $concat: ["$room.roomNumber", "-", { $toString: "$allocation.bedNumber" }] },
            },
          },
          else: null,
        },
      },
    },
  })

  pipeline.push({
    $facet: {
      data: [{ $sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 } }, { $skip: (parseInt(page) - 1) * parseInt(limit) }, { $limit: parseInt(limit) }],
      totalCount: [{ $count: "count" }],
    },
  })

  return this.aggregate(pipeline)
}

StudentProfileSchema.index({ userId: 1, rollNumber: 1 })

const StudentProfile = mongoose.model("StudentProfile", StudentProfileSchema)

export default StudentProfile
