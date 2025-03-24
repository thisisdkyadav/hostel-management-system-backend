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
  guardian: {
    type: String,
    trim: true,
  },
  guardianPhone: {
    type: String,
    trim: true,
  },
  currentRoomAllocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAllocation",
  },
})

StudentProfileSchema.statics.getFullStudentData = async function (userId) {
  try {
    const studentProfile = await this.findOne({ userId })
      .populate({
        path: "userId",
        select: "name email phone profilePic",
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

    if (!studentProfile) {
      return null
    }

    let year = ""
    if (studentProfile.admissionDate) {
      const currentDate = new Date()
      const admissionYear = studentProfile.admissionDate.getFullYear()
      const currentYear = currentDate.getFullYear()
      const monthDiff = (currentDate.getMonth() - studentProfile.admissionDate.getMonth()) / 12
      const yearDiff = currentYear - admissionYear + (monthDiff > 0 ? 0 : -1) + 1

      switch (yearDiff) {
        case 0:
          year = "1st Year"
          break
        case 1:
          year = "2nd Year"
          break
        case 2:
          year = "3rd Year"
          break
        default:
          year = `${yearDiff + 1}th Year`
      }
    }

    const formattedDOB = studentProfile.dateOfBirth ? studentProfile.dateOfBirth.toISOString().split("T")[0] : ""

    const fullData = {
      userId: studentProfile.userId?._id || "",
      id: studentProfile._id,
      name: studentProfile.userId?.name || "",
      email: studentProfile.userId?.email || "",
      phone: studentProfile.userId?.phone || "",
      profilePic: studentProfile.userId?.profilePic || "",
      rollNumber: studentProfile.rollNumber,
      department: studentProfile.department || "",
      degree: studentProfile.degree || "",
      year: year,
      gender: studentProfile.gender || "",
      dateOfBirth: formattedDOB,
      address: studentProfile.address || "",
      guardian: studentProfile.guardian || "",
      guardianPhone: studentProfile.guardianPhone || "",
      admissionDate: studentProfile.admissionDate,
    }

    if (studentProfile.currentRoomAllocation) {
      fullData.hostel = studentProfile.currentRoomAllocation.hostelId?.name || ""
      fullData.unit = studentProfile.currentRoomAllocation.roomId?.unitId?.unitNumber || ""
      fullData.room = studentProfile.currentRoomAllocation.roomId?.roomNumber || ""
      fullData.bedNumber = studentProfile.currentRoomAllocation.bedNumber?.toString() || ""
      fullData.allocationId = studentProfile.currentRoomAllocation._id
      fullData.hostelType = studentProfile.currentRoomAllocation.hostelId?.type || ""
    }

    return fullData
  } catch (error) {
    console.error("Error fetching full student data:", error)
    throw error
  }
}

const StudentProfile = mongoose.model("StudentProfile", StudentProfileSchema)

export default StudentProfile
