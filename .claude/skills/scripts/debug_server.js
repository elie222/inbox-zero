#!/usr/bin/env node
/**
 * Debug Log Server
 *
 * Endpoints:
 *   POST /session { name: "fix-null-user" } → { session_id: "fix-null-user-a1b2c3", log_file: "..." }
 *   POST /log { sessionId: "...", msg: "...", data: {...} } → { ok: true }
 *   GET / → { status: "ok", log_dir: "..." }
 *
 * Usage:
 *     node debug_server.js /path/to/project
 *
 * Environment:
 *     DEBUG_LOG_DIR - Override log subdirectory (default: .debug)
 *     DEBUG_PORT    - Override port (default: 8787)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const generateId = () => crypto.randomBytes(3).toString('hex');

// Normalize name to kebab-case: "Fix Null User" → "fix-null-user"
const toKebabCase = (str) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → dash
    .replace(/-+/g, '-')          // multiple dashes → single
    .replace(/^-|-$/g, '');       // trim leading/trailing dashes

const PROJECT_DIR = process.argv[2] || '.';
const LOG_SUBDIR = process.env.DEBUG_LOG_DIR || '.debug';
const LOG_DIR = path.join(PROJECT_DIR, LOG_SUBDIR);
const PORT = Number.parseInt(process.env.DEBUG_PORT || '8787', 10);

// Check if server already running
(async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const res = await fetch(`http://localhost:${PORT}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      // Server already running - output JSON and exit successfully
      console.log(JSON.stringify({
        status: 'already_running',
        log_dir: LOG_DIR,
        endpoint: `http://localhost:${PORT}/log`,
      }));
      process.exit(0);
    }
  } catch {}

  // Cleanup stale port (crash recovery)
  try {
    const pid = execSync(`lsof -ti:${PORT}`, { encoding: 'utf-8' }).trim();
    if (pid) {
      execSync(`kill -9 ${pid}`);
    }
  } catch {}

  startServer();
})();

function startServer() {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const getLogFile = (sessionId) => path.join(LOG_DIR, `debug-${sessionId}.log`);

  const server = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({
        status: 'ok',
        log_dir: LOG_DIR,
      }));
      return;
    }

    // Create new session: POST /session { name: "fix-null-user" }
    if (req.method === 'POST' && req.url === '/session') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const name = toKebabCase(data.name || 'debug');
          const sessionId = `${name}-${generateId()}`;
          const logFile = getLogFile(sessionId);

          // Create empty log file
          fs.writeFileSync(logFile, '');

          res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
          res.end(JSON.stringify({
            session_id: sessionId,
            log_file: logFile,
          }));

          console.log(`[session] Created: ${sessionId}`);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Log message: POST /log { sessionId: "...", msg: "...", data: {...} }
    if (req.method === 'POST' && req.url === '/log') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const sessionId = data.sessionId || 'default';
          const logFile = getLogFile(sessionId);

          // Remove sessionId from stored entry (it's in filename)
          const { sessionId: _, ...rest } = data;
          const entry = { ts: new Date().toISOString(), ...rest };

          fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);

          res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
          res.end(JSON.stringify({ ok: true, log_file: logFile }));

          console.log(`[${sessionId}] ${entry.msg || JSON.stringify(entry).slice(0, 80)}`);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404, cors);
    res.end('Not found');
  });

  server.listen(PORT, () => {
    // Output JSON for easy parsing by agent
    console.log(JSON.stringify({
      status: 'started',
      log_dir: LOG_DIR,
      endpoint: `http://localhost:${PORT}/log`,
    }));
  });
}
