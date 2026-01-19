#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const [, , action, projectPath, sessionId] = process.argv;

if (!action || !projectPath || !sessionId) {
  console.error("Usage: node debug_cleanup.js <action> <project-path> <session-id>");
  console.error("Actions:");
  console.error("  clear  - Truncate log file to empty");
  console.error("  remove - Delete log file");
  process.exit(1);
}

const logSubdir = process.env.DEBUG_LOG_DIR || ".debug";
const logDir = path.join(projectPath, logSubdir);
// Accept either:
// - raw session id: "1234567890" -> debug-1234567890.log
// - full file base: "debug-1234567890" -> debug-1234567890.log
const toLogFileBase = (raw) => {
  const base = raw.endsWith(".log") ? raw.slice(0, -4) : raw;
  return base.startsWith("debug-") ? base : `debug-${base}`;
};
const logFile = path.join(logDir, `${toLogFileBase(sessionId)}.log`);

if (!fs.existsSync(logFile)) {
  console.error(`Log file not found: ${logFile}`);
  process.exit(1);
}

switch (action) {
  case "clear":
    fs.writeFileSync(logFile, "");
    console.log(`Cleared: ${logFile}`);
    break;
  case "remove":
    fs.unlinkSync(logFile);
    console.log(`Removed: ${logFile}`);
    break;
  default:
    console.error(`Unknown action: ${action}`);
    console.error("Valid actions: clear, remove");
    process.exit(1);
}
