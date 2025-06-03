import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
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
import { PORT } from "./config/environment.js"
import connectDB from "./config/db.js"

const app = express()
// app.use(express.json())
app.use(express.urlencoded({ limit: "1mb", extended: true }))
app.use(cookieParser())
app.set("trust proxy", 1)

app.use(
  cors({
    origin: [
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

// app.use(
//   cors({
//     origin: "*",
//     credentials: true,
//   })
// )

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
