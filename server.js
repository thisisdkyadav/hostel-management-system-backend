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
import { PORT } from "./config/environment.js"
import connectDB from "./config/db.js"

const app = express()
app.use(express.json())
app.use(cookieParser())

app.use(
  cors({
    origin: ["http://localhost:5000", "http://localhost:5173"], // Web app URLs
    credentials: true, // Allow cookies for web
  })
)

app.use("/api/auth", authRoutes)
app.use("/api/warden", wardenRoutes)
app.use("/api/student", studentRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/complaint", complaintRoutes)
app.use("/api/security", securityRoutes)
app.use("/api/lost-and-found", LostAndFoundRoutes)
app.use("/api/event", eventRoutes)

app.get("/", (req, res) => {
  res.send("Hello World!")
})

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  // Connect to MongoDB
  console.log("Connecting to MongoDB...")
  connectDB()
  console.log("MongoDB connected successfully")
})
