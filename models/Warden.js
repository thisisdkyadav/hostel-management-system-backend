const mongoose = require('mongoose');

const wardenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    hostel: { type: String, required: true },
    profilePic: { type: String },
    servicePeriod: {
        from: { type: Date, required: true },
        to: { type: Date }
    },
    address: { type: String },
    dateOfBirth: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const Warden = mongoose.model('Warden', wardenSchema);
module.exports = Warden;
