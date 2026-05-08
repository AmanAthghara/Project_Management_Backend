const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const projectsRoutes = require("./routes/projects");
const tasksRoutes = require("./routes/tasks");
const taskAssignmentsRoutes = require("./routes/taskAssignments");
const notificationsRoutes = require("./routes/notifications");
const joinRequestsRoutes = require("./routes/joinRequests");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();
// const app = express();

app.set('trust proxy', 1); 

// Security headers
app.use(helmet());

// CORS
app.use(cors());

// Request logging (dev only)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api", tasksRoutes);
app.use("/api", taskAssignmentsRoutes);
app.use("/api", notificationsRoutes);   // was "/api/notifications"
app.use("/api", joinRequestsRoutes);    // was "/api/join-requests"

app.get("/", (req, res) => {
  res.json({ message: "API running" });
});

// Error handler — must be last
app.use(errorHandler);

module.exports = app;