/**
 * AppDevice Model
 * One row per student per device (browser storage), refreshed on every visit:
 * which platform/browser, whether it ran as the installed SMS app (PWA), and
 * when it was first/last seen. Feeds the admin App Usage page.
 *
 * `deviceId` is a random id kept in the browser's localStorage. On iPhone the
 * home-screen app has its own storage, so it shows up as its own device.
 */

import mongoose from "mongoose"

export const APP_PLATFORMS = ["android", "ios", "desktop"]
export const APP_BROWSERS = ["chrome", "edge", "samsung", "firefox", "opera", "safari", "inapp", "other"]

const AppDeviceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    deviceId: { type: String, required: true, trim: true, maxlength: 64 },
    platform: { type: String, enum: APP_PLATFORMS, required: true },
    browser: { type: String, enum: APP_BROWSERS, default: "other" },
    // How the last visit ran: inside the installed app, or in a browser tab.
    mode: { type: String, enum: ["app", "browser"], required: true },
    // Which student layout the browser showed (phone app layout or classic).
    layout: { type: String, enum: ["phone", "classic"], default: "classic" },
    // Android Chrome can tell a tab that the app is installed (null = unknown).
    installedHint: { type: Boolean, default: null },
    visits: { type: Number, default: 0 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    firstAppAt: { type: Date, default: null },
    lastAppAt: { type: Date, default: null },
  },
  { timestamps: false }
)

AppDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true })
AppDeviceSchema.index({ lastSeenAt: -1 })
AppDeviceSchema.index({ firstAppAt: 1 })

const AppDevice = mongoose.model("AppDevice", AppDeviceSchema)

export default AppDevice
