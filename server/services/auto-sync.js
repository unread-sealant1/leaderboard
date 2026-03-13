const { syncAll } = require("./dreamclass-sync");

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const DEFAULT_HOURS = 6;
const intervalHours = toPositiveNumber(process.env.AUTO_SYNC_HOURS, DEFAULT_HOURS);
const intervalMs = intervalHours * 60 * 60 * 1000;
const enabled = toBoolean(process.env.AUTO_SYNC_ENABLED, true);
const runOnStart = toBoolean(process.env.AUTO_SYNC_RUN_ON_START, false);

const state = {
  enabled,
  intervalHours,
  intervalMs,
  runOnStart,
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastResult: null,
  lastError: null,
  nextRunAt: null,
  timer: null
};

function scheduleNextRun() {
  if (!state.enabled) return;
  if (state.timer) clearTimeout(state.timer);
  state.nextRunAt = new Date(Date.now() + state.intervalMs).toISOString();
  state.timer = setTimeout(async () => {
    await runAutoSync("scheduled");
    scheduleNextRun();
  }, state.intervalMs);
  if (typeof state.timer.unref === "function") {
    state.timer.unref();
  }
}

async function runAutoSync(trigger = "manual") {
  if (!state.enabled) {
    return { ok: false, skipped: true, reason: "AUTO_SYNC_DISABLED" };
  }
  if (state.running) {
    return { ok: false, skipped: true, reason: "AUTO_SYNC_ALREADY_RUNNING" };
  }

  state.running = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastError = null;

  try {
    const result = await syncAll({ replaceLocalAcademic: false, createMissingTopics: true });
    state.lastResult = {
      trigger,
      configured: result?.configured !== false,
      partial: Boolean(result?.partial),
      finishedAt: new Date().toISOString()
    };
    console.log(
      `[auto-sync] ${trigger} sync finished at ${state.lastResult.finishedAt} ` +
      `(configured=${state.lastResult.configured}, partial=${state.lastResult.partial})`
    );
    return result;
  } catch (error) {
    state.lastError = {
      trigger,
      message: error?.message || "Auto sync failed",
      at: new Date().toISOString()
    };
    console.error("[auto-sync] sync failed:", error);
    throw error;
  } finally {
    state.running = false;
    state.lastFinishedAt = new Date().toISOString();
  }
}

function startAutoSyncScheduler() {
  if (!state.enabled) {
    console.log("[auto-sync] disabled");
    return;
  }

  console.log(`[auto-sync] enabled; interval=${state.intervalHours}h`);

  if (runOnStart) {
    runAutoSync("startup")
      .catch(() => {})
      .finally(() => scheduleNextRun());
    return;
  }

  scheduleNextRun();
}

function getAutoSyncStatus() {
  return {
    enabled: state.enabled,
    intervalHours: state.intervalHours,
    runOnStart: state.runOnStart,
    running: state.running,
    lastStartedAt: state.lastStartedAt,
    lastFinishedAt: state.lastFinishedAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
    nextRunAt: state.nextRunAt
  };
}

module.exports = {
  startAutoSyncScheduler,
  getAutoSyncStatus,
  runAutoSync
};
