require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const db = require("./db-sqlite");
const { startAutoSyncScheduler, getAutoSyncStatus } = require("./services/auto-sync");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const teamsRoutes = require("./routes/teams");
const studentsRoutes = require("./routes/students");
const periodsRoutes = require("./routes/periods");
const termsRoutes = require("./routes/terms");
const phasesRoutes = require("./routes/phases");
const topicsRoutes = require("./routes/topics");
const teamPerformanceRoutes = require("./routes/team-performance");
const messagesRoutes = require("./routes/messages");
const attendanceRoutes = require("./routes/attendance");
const gradesRoutes = require("./routes/grades");
const gradeDetailRoutes = require("./routes/grade-detail");
const coachingRoutes = require("./routes/coaching");
const tvRoutes = require("./routes/tv");
const tvAdvanceRoutes = require("./routes/tv-advance");
const dreamClassRoutes = require("./routes/dreamclass");
const streamCommentsRoutes = require("./routes/stream-comments");
const sprintDefinitionsRoutes = require("./routes/sprint-definitions");

const app = express();

function quotePgIdentifier(value) {
  return `"${String(value || "").replace(/"/g, "\"\"")}"`;
}

async function ensurePostgresDatabaseExists() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  const targetUrl = new URL(connectionString);
  const host = String(targetUrl.hostname || "").trim().toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const databaseName = decodeURIComponent(targetUrl.pathname.replace(/^\//, "") || "");
  if (!databaseName || databaseName === "postgres" || !isLocalHost) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const pool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const exists = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1",
      [databaseName]
    );
    if (!exists.rows.length) {
      await pool.query(`CREATE DATABASE ${quotePgIdentifier(databaseName)}`);
    }
  } finally {
    await pool.end();
  }
}

async function runPostgresMigrations() {
  if (!process.env.DATABASE_URL) return;
  await ensurePostgresDatabaseExists();
  const sqlDir = path.join(__dirname, "sql");
  const files = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(sqlDir, file), "utf8");
    if (!sql.trim()) continue;
    await db.query(sql);
  }
}

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true, autoSync: getAutoSyncStatus() }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/periods", periodsRoutes);
app.use("/api/terms", termsRoutes);
app.use("/api/phases", phasesRoutes);
app.use("/api/topics", topicsRoutes);
app.use("/api/team-performance", teamPerformanceRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/grades", gradesRoutes);
app.use("/api/grade-detail", gradeDetailRoutes);
app.use("/api/coaching", coachingRoutes);
app.use("/api/stream-comments", streamCommentsRoutes);
app.use("/api/sprint-definitions", sprintDefinitionsRoutes);
app.use("/api/integrations/dreamclass", dreamClassRoutes);
app.use("/api/tv", tvRoutes);
app.use("/api/tv", tvAdvanceRoutes);

const port = process.env.PORT || 5500;

runPostgresMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server v2 running on ${port}`);
      startAutoSyncScheduler();
    });
  })
  .catch((error) => {
    console.error("Migration startup failed:", error);
    process.exit(1);
  });
