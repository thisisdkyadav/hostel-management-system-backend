import mongoose from "mongoose"

/**
 * One face machine talking to HMS directly over the ZKTeco PUSH ("iclock")
 * protocol. Created automatically the first time a serial number checks in;
 * an admin then links it to a FaceScanner (which says what the machine is for:
 * dining caterer, hostel gate, direction).
 *
 * mode:
 *   shadow — record everything, change nothing (used while EasyWDMS still runs)
 *   live   — punches are turned into meal/gate records
 */
export const ICLOCK_DEVICE_MODES = ["shadow", "live"]

const IclockDeviceSchema = new mongoose.Schema(
  {
    sn: { type: String, required: true, unique: true, trim: true },
    alias: { type: String, default: "", trim: true },
    faceScannerId: { type: mongoose.Schema.Types.ObjectId, ref: "FaceScanner", default: null },
    mode: { type: String, enum: ICLOCK_DEVICE_MODES, default: "shadow" },

    // What the machine told us about itself (handshake query, INFO=, options upload).
    pushVersion: { type: String, default: "" },
    info: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
    forwardedFor: { type: String, default: "" },

    // Upload watermarks the machine sends back to us (Stamp= on each upload).
    stamps: { type: mongoose.Schema.Types.Mixed, default: {} },
    nextCommandId: { type: Number, default: 1 },

    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: null },
    lastHandshakeAt: { type: Date, default: null },
    lastPunchAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export default mongoose.models.IclockDevice || mongoose.model("IclockDevice", IclockDeviceSchema)
