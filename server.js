import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import session from "express-session"
import MongoStore from "connect-mongo"
import authRoutes from "./routes/authRoutes.js"
import wardenRoutes from "./routes/wardenRoute.js"
import studentRoutes from "./routes/studentRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import complaintRoutes from "./routes/complaintRoutes.js"
import LostAndFoundRoutes from "./routes/lostAndFoundRoutes.js"
import securityRoutes from "./routes/securityRoutes.js"
import eventRoutes from "./routes/eventRoutes.js"
import hostelRoutes from "./routes/hostelRoutes.js"
import statsRoutes from "./routes/statsRoutes.js"
import feedbackRoutes from "./routes/feedbackRoutes.js"
import uploadRoutes from "./routes/uploadRoutes.js"
import visitorRoutes from "./routes/visitorRoutes.js"
import notificationRoutes from "./routes/notificationRoutes.js"
import disCoRoutes from "./routes/disCoRoutes.js"
import paymentRoutes from "./routes/paymentRoutes.js"
import externalApiRoutes from "./externalApi/index.js"
import superAdminRoutes from "./routes/superAdminRoutes.js"
import familyMemberRoutes from "./routes/familyMemberRoutes.js"
import staffAttendanceRoutes from "./routes/staffAttendanceRoutes.js"
import inventoryRoutes from "./routes/inventoryRoutes.js"
import permissionRoutes from "./routes/permissionRoutes.js"
import taskRoutes from "./routes/taskRoutes.js"
import userRoutes from "./routes/userRoutes.js"
import { PORT, ALLOWED_ORIGINS, USE_LOCAL_STORAGE, SESSION_SECRET, MONGO_URI } from "./config/environment.js"
import connectDB from "./config/db.js"
import dashboardRoutes from "./routes/dashboardRoutes.js"
import path from "path"
import { fileURLToPath } from "url"
import { ensureSession } from "./middlewares/auth.js"
import configRoutes from "./routes/configRoutes.js"
import studentProfileRoutes from "./routes/studentProfileRoutes.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
// app.use(express.json())
app.use(express.urlencoded({ limit: "1mb", extended: true }))
app.use(cookieParser())
app.set("trust proxy", 1)

app.use(
  cors({
    origin: ALLOWED_ORIGINS
      ? ALLOWED_ORIGINS.split(",")
      : [
          "https://hostel-management-system.web.app",
          "https://flask-vercel-ashen.vercel.app",
          "http://localhost",
          "http://localhost:5173",
          "http://localhost:5174",
          "http://localhost:51839",
          "http://localhost:4173",
          "https://hostel-management-system-backend-and4hrevaag3f5gs.centralindia-01.azurewebsites.net",
          "https://flask-vercel-ny5uvtgck-deveshyadav076.vercel.app",
          "https://hms.andiindia.in",
        ],
    credentials: true, // Allow cookies for web
  })
)

// Setup session middleware
const isDevelopmentEnvironment = process.env.NODE_ENV === "development"
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
      autoRemove: "native", // Use MongoDB's TTL indexes
      touchAfter: 24 * 3600, // Refresh the session only once per 24 hours
      crypto: {
        secret: SESSION_SECRET,
      },
    }),
    cookie: {
      httpOnly: true,
      secure: !isDevelopmentEnvironment,
      sameSite: !isDevelopmentEnvironment ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    },
  })
)

// Serve static files from the uploads directory when using local storage
if (USE_LOCAL_STORAGE) {
  app.use("/uploads", express.static(path.join(__dirname, "uploads")))
}

app.use("/api/upload", uploadRoutes)

app.use(express.json({ limit: "1mb" }))
app.use("/api/auth", authRoutes)
app.use("/api/warden", wardenRoutes)
app.use("/api/student", studentRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/complaint", complaintRoutes)
app.use("/api/security", securityRoutes)
app.use("/api/lost-and-found", LostAndFoundRoutes)
app.use("/api/event", eventRoutes)
app.use("/api/hostel", hostelRoutes)
app.use("/api/stats", statsRoutes)
app.use("/api/feedback", feedbackRoutes)
app.use("/api/visitor", visitorRoutes)
app.use("/api/notification", notificationRoutes)
app.use("/api/disCo", disCoRoutes)
app.use("/api/payment", paymentRoutes)
app.use("/api/super-admin", superAdminRoutes)
app.use("/api/family", familyMemberRoutes)
app.use("/api/staff", staffAttendanceRoutes)
app.use("/api/inventory", inventoryRoutes)
app.use("/api/permissions", permissionRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/tasks", taskRoutes)
app.use("/api/users", userRoutes)
app.use("/api/config", configRoutes)
app.use("/api/student-profile", studentProfileRoutes)

app.use("/external-api", externalApiRoutes)

app.get("/", (req, res) => {
  res.send("Hello World!!")
})

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`)
  // Connect to MongoDB
  console.log("Connecting to MongoDB...")
  connectDB()
  console.log("MongoDB connected successfully")
})
