import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./pr-screenshots", import.meta.url));

test("rejects a stale run without fetching its manifest or emitting links", () => {
  const { result, requests } = run("old-sha");
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /latest published run is for old-sha, PR head is head-sh/,
  );
  assert.deepEqual(requests, ["https://example.com/history.json"]);
});

test("emits screenshot links for the current PR head", () => {
  const { result, requests } = run("head-sha");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    "mail_scompose\t![Compose](https://example.com/runs/1/compose.png)\n",
  );
  assert.deepEqual(requests, [
    "https://example.com/history.json",
    "https://example.com/runs/1/manifest.json",
  ]);
});

function run(sha) {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-screenshots-test-"));
  try {
    writeFileSync(
      path.join(dir, "gh"),
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'api') {
  process.stdout.write(JSON.stringify([[{user: {login: 'github-actions[bot]'}, body: '<!-- inbox-zero-playwright-screenshots --> https://example.com/prs/1/index.html'}]]));
} else if (args[0] === 'pr' && args.includes('headRefOid')) {
  process.stdout.write('head-sha');
} else { process.exit(1); }
`,
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(dir, "curl"),
      `#!/usr/bin/env node
const fs = require('node:fs');
const url = process.argv.at(-1);
fs.appendFileSync(process.env.REQUEST_LOG, url + '\\n');
if (url === 'https://example.com/history.json') {
  process.stdout.write(JSON.stringify([{pullRequestNumber: 1, sha: process.env.RUN_SHA, screenshotsUrl: 'https://example.com/runs/1/index.html'}]));
} else if (url === 'https://example.com/runs/1/manifest.json') {
  process.stdout.write(JSON.stringify({screenshots: [{source: 'mail_scompose', title: 'Compose', fileName: 'compose.png', captureType: 'checkpoint'}]}));
} else { process.exit(1); }
`,
      { mode: 0o755 },
    );
    const requestLog = path.join(dir, "requests");
    const result = spawnSync("bash", [script, "1"], {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        RUN_SHA: sha,
        REQUEST_LOG: requestLog,
      },
    });
    return {
      result,
      requests: readFileSync(requestLog, "utf8").trim().split("\n"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
