import mongoose from "mongoose"

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  profilePic: { type: String },
  role: {
    type: String,
    enum: ["Student", "Maintenance Staff", "Warden", "Admin", "Security Staff"],
    required: true,
  },
  password: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

UserSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const User = mongoose.model("User", UserSchema)

export default User
