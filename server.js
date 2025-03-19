import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import authRoutes from "./routes/authRoutes.js"
import studentRoutes from "./routes/studentRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
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
app.use("/api/student", studentRoutes)
app.use("/api/admin", adminRoutes)

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
