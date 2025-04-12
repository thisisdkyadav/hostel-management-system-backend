import StudentProfile from "../../models/StudentProfile.js"
import User from "../../models/User.js"

export const searchStudentProfiles = async (req, res) => {
  const query = req.query
  try {
    const { _id, rollNumber, name, email, phone, degree, department, gender } = query

    const pipeline = []

    const profileMatch = {}
    if (_id) profileMatch._id = new mongoose.Types.ObjectId(_id)
    if (rollNumber) profileMatch.rollNumber = new RegExp(rollNumber, "i")
    if (degree) profileMatch.degree = new RegExp(degree, "i")
    if (department) profileMatch.department = new RegExp(department, "i")
    if (gender) profileMatch.gender = gender

    if (Object.keys(profileMatch).length > 0) {
      pipeline.push({ $match: profileMatch })
    }

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "userData",
      },
    })

    pipeline.push({ $unwind: "$userData" })

    if (name || email || phone) {
      const userMatch = {}
      if (name) userMatch["userData.name"] = new RegExp(name, "i")
      if (email) userMatch["userData.email"] = new RegExp(email, "i")
      if (phone) userMatch["userData.phone"] = new RegExp(phone, "i")
      pipeline.push({ $match: userMatch })
    }

    const filteredStudents = await StudentProfile.aggregate(pipeline)
    const userIds = filteredStudents.map((student) => student.userId)

    const formattedProfiles = await StudentProfile.getFullStudentData(userIds)

    res.status(200).json(formattedProfiles)
  } catch (error) {
    console.error("Error fetching student profiles:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
