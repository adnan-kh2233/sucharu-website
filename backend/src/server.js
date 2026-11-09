require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const { getFirestoreDb } = require("./config/firebase");
const authRoutes = require("./routes/auth");
const serviceRoutes = require("./routes/services");
const bookingRoutes = require("./routes/bookings");
const partnerRoutes = require("./routes/partners");
const dashboardRoutes = require("./routes/dashboard");
const partnerPortalRoutes = require("./routes/partner-portal");
const customerRoutes = require("./routes/customers");
const supportRoutes = require("./routes/support");
const { notFound, errorHandler } = require("./middleware/errors");

function validateConfig() {
  const secret = process.env.JWT_SECRET || "";
  if (secret.length < 32 || /change|replace|example|placeholder|your[_ -]?secret/i.test(secret)) {
    throw new Error("Set a unique JWT_SECRET of at least 32 characters in backend/.env before starting the API.");
  }
  if (!String(process.env.FIREBASE_PROJECT_ID || "").trim()) throw new Error("Set FIREBASE_PROJECT_ID in backend/.env before starting the API.");
}

function createApp() {
  const app = express();
  const origins = String(process.env.CLIENT_URL || "http://127.0.0.1:5500,http://localhost:5500")
    .split(",").map(value => value.trim()).filter(Boolean);
  app.disable("x-powered-by");
  app.use(cors({ origin(origin, callback) {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  }, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"], maxAge: 600 }));
  app.use(express.json({ limit: "512kb", strict: true }));
  app.use((req, res, next) => {
    if (req.method === "POST" && req.get("X-HTTP-Method-Override") === "PATCH") req.method = "PATCH";
    next();
  });
  app.get("/api/health", async (req, res) => {
    try { await getFirestoreDb().collection("_health").doc("ping").get(); return res.json({ status: "ok", database: "connected", provider: "firebase" }); }
    catch { return res.status(503).json({ status: "database_unavailable", database: "disconnected", provider: "firebase" }); }
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/services", serviceRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/partners", partnerRoutes);
  app.use("/api/partner", partnerPortalRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/support", supportRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}

async function start() {
  validateConfig();
  await getFirestoreDb().collection("_health").doc("ping").get();
  const port = Number(process.env.PORT || 5000);
  const server = createApp().listen(port, () => console.log(`Sucharu API listening on port ${port}`));
  const shutdown = async () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) start().catch(error => {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
});

module.exports = { createApp, validateConfig };
