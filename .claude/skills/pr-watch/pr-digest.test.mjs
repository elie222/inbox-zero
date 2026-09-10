import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./pr-digest", import.meta.url));
const pending = { name: "Slow browser tests", status: "in_progress", conclusion: null, started_at: "2026-01-01T00:00:00Z" };
const failed = { name: "Web E2E", status: "completed", conclusion: "failure", html_url: "https://github.com/example/repo/actions/runs/1/job/42" };

for (const conclusion of ["failure", "timed_out", "cancelled"]) {
  test(`reports ${conclusion} without waiting for another job`, () => {
    const result = run(["--watch"], { checks: [pending, { ...failed, conclusion }] });
    assert.equal(result.status, 10, result.stderr);
    assert.match(result.stdout, /VERDICT failures/);
    assert.match(result.stdout, /PENDING Slow browser tests/);
    assert.doesNotMatch(result.stdout, /tests did not run/);
  });
}

test("a failing commit status wakes the watch while checks run", () => {
  const result = run(["--watch"], { checks: [pending], statuses: [{ context: "External gate", state: "error" }] });
  assert.equal(result.status, 10, result.stderr);
  assert.match(result.stdout, /STATUS External gate error/);
});

test("wait deadline reports pending jobs without claiming a CI failure", () => {
  const result = run(["--watch"], { checks: [pending, { ...failed, conclusion: "success" }] }, { PR_DIGEST_DEADLINE: "0" });
  assert.equal(result.status, 12, result.stderr);
  assert.match(result.stdout, /WAIT_LIMIT/);
  assert.match(result.stdout, /1 pending/);
  assert.match(result.stdout, /Slow browser tests \[in_progress\]/);
  assert.doesNotMatch(result.stdout, /VERDICT green|VERDICT failures/);
});

test("returns green for terminal passing checks", () => {
  const result = run(["--watch"], { checks: [{ ...failed, conclusion: "success" }] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /VERDICT green/);
});

test("reads completed-job logs directly and preserves startup and type errors", () => {
  const result = run(["--logs", "42"], { logs: [
    "2026-01-01T00:00:00Z \u001b[31m[WebServer] Error: listen EADDRINUSE: address already in use :3000\u001b[0m",
    "2026-01-01T00:00:01Z Error: Timed out waiting 240000ms from config.webServer.",
    "2026-01-01T00:00:02Z Type error: Type boolean is not assignable to true.",
  ].join("\n") });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /EADDRINUSE/);
  assert.match(result.stdout, /Timed out waiting 240000ms/);
  assert.match(result.stdout, /Type error:/);
  assert.doesNotMatch(result.stdout, /\u001b\[/);
});

test("unavailable job logs produce an explicit error", () => {
  const result = run(["--logs", "42"], {});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /logs unavailable/);
});

function run(args, fixture, env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-digest-test-"));
  try {
    writeFileSync(path.join(dir, "gh"), `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const a = process.argv.slice(2);
const f = JSON.parse(process.env.DIGEST_FIXTURE);
const route = a.find(value => value.startsWith('repos/')) || '';
let data;
if (a[0] === 'repo') data = { nameWithOwner: 'example/repo' };
else if (a[0] === 'pr') data = { number: 1, headRefOid: 'abc', headRefName: 'feature', state: 'OPEN', mergeable: 'MERGEABLE', reviewDecision: '' };
else if (a.includes('graphql')) data = { data: { viewer: { login: 'owner' } } };
else if (route.includes('/check-runs')) data = { check_runs: f.checks || [] };
else if (route.includes('/status?')) data = { statuses: f.statuses || [] };
else if (route.endsWith('/logs')) {
  if (f.logs === undefined) { process.stderr.write('Logs not available'); process.exit(1); }
  process.stdout.write(f.logs); process.exit(0);
}
else if (route.includes('/actions/jobs/')) data = { steps: [{ name: 'Build app', number: 1, conclusion: 'failure' }, { name: 'Upload', number: 2, conclusion: 'skipped' }] };
else if (route.includes('/comments?') || route.includes('/reviews?')) data = [];
else { process.stderr.write('Unexpected gh call: ' + a.join(' ')); process.exit(1); }
const filter = a.indexOf('--jq');
if (filter >= 0) {
  const result = spawnSync('jq', ['-r', a[filter + 1]], { input: JSON.stringify(data), encoding: 'utf8' });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.status);
}
process.stdout.write(JSON.stringify(data));
`, { mode: 0o755 });
    writeFileSync(path.join(dir, "git"), "#!/bin/sh\nif [ \"$1\" = branch ]; then echo feature; else echo abc; fi\n", { mode: 0o755 });
    return spawnSync("bash", [script, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, DIGEST_FIXTURE: JSON.stringify(fixture), PR_DIGEST_SEEN_DIR: dir, PR_DIGEST_DEADLINE: "3600", ...env },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
