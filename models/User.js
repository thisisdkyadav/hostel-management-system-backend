// User model
// user can login with email and password or google so password is not required when user login with google
// all personal info is in student profile model

import mongoose from "mongoose"

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: {
    type: String,
    enum: ["Student", "Hostel Secretary", "Maintenance Staff", "Warden", "Admin", "Super Admin"],
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
