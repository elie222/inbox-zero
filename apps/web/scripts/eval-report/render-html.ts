import type { DashboardData } from "./aggregate";

// Self-contained dashboard: no network requests, works as a local file.
// Data is embedded as JSON and all rendering happens client-side so the
// page can offer filtering without a server.
export function renderDashboardHtml(data: DashboardData): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Eval Deck · Inbox Zero</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="vignette"></div>
<div class="scanlines"></div>

<header class="masthead reveal">
  <div class="masthead-title">
    <span class="sigil">▣</span>
    <h1>EVAL&nbsp;DECK</h1>
    <span class="subtitle">Inbox Zero · model evaluation telemetry</span>
  </div>
  <div class="masthead-controls">
    <label class="commit-filter" for="commit-select">
      <span>commit</span>
      <select id="commit-select" aria-label="Filter by git commit"></select>
    </label>
    <div class="masthead-meta" id="masthead-meta"></div>
  </div>
</header>

<main>
  <section class="kpi-strip reveal" id="kpi-strip"></section>

  <section class="panel reveal">
    <div class="panel-head">
      <h2><span class="index">01</span> Model leaderboard</h2>
      <span class="panel-note" id="leaderboard-note">latest result per suite · test · model</span>
    </div>
    <div id="leaderboard"></div>
  </section>

  <section class="panel reveal">
    <div class="panel-head">
      <h2><span class="index">02</span> Suite × model matrix</h2>
      <span class="panel-note" id="matrix-note">click a cell to inspect · ◆ = matches baseline pass count</span>
    </div>
    <div class="matrix-scroll" id="matrix"></div>
  </section>

  <section class="panel reveal">
    <div class="panel-head">
      <h2><span class="index">03</span> Cost routing</h2>
      <span class="panel-note" id="routing-note">suites where a cheaper model matches your quality baseline</span>
    </div>
    <div class="routing-controls">
      <label for="baseline-select">
        <span>quality baseline</span>
        <select id="baseline-select" aria-label="Quality baseline model"></select>
      </label>
    </div>
    <div id="routing"></div>
  </section>

  <section class="panel reveal">
    <div class="panel-head">
      <h2><span class="index">04</span> Suite inspector</h2>
      <span class="panel-note" id="inspector-note"></span>
    </div>
    <div class="inspector-controls">
      <select id="suite-select" aria-label="Suite"></select>
      <select id="model-select" aria-label="Model"></select>
      <label class="toggle"><input type="checkbox" id="failures-only" /> failures only</label>
      <input type="search" id="search" placeholder="filter tests…" />
    </div>
    <div id="trend"></div>
    <div id="tests"></div>
  </section>

  <section class="panel reveal">
    <div class="panel-head">
      <h2><span class="index">05</span> Spend</h2>
      <span class="panel-note" id="cost-note">summed for selected commit</span>
    </div>
    <div id="cost"></div>
  </section>

  <footer id="warnings"></footer>
</main>

<script>
const DATA = ${json};
${JS}
</script>
</body>
</html>
`;
}

const CSS = `
:root {
  --bg: #0a0e0c;
  --panel: #0f1512;
  --panel-edge: #1c2a22;
  --grid-line: #16201a;
  --text: #cfdcd2;
  --dim: #74867a;
  --faint: #4a584f;
  --pass: #4be38b;
  --pass-dim: rgba(75, 227, 139, 0.14);
  --fail: #ff6259;
  --fail-dim: rgba(255, 98, 89, 0.12);
  --cache: #e3b34f;
  --accent: #6fd6c9;
  --mono: ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background:
    radial-gradient(1200px 600px at 70% -10%, rgba(111, 214, 201, 0.06), transparent 60%),
    radial-gradient(900px 500px at 0% 110%, rgba(75, 227, 139, 0.05), transparent 55%),
    var(--bg);
  color: var(--text);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.5;
  padding: 28px clamp(16px, 4vw, 56px) 80px;
}

.scanlines {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.012) 0px,
    rgba(255, 255, 255, 0.012) 1px,
    transparent 1px,
    transparent 3px
  );
  z-index: 2;
}

.vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.45));
  z-index: 1;
}

main, header { position: relative; z-index: 3; }

.reveal { animation: rise 0.5s ease-out backwards; }
.reveal:nth-of-type(2) { animation-delay: 0.06s; }
.reveal:nth-of-type(3) { animation-delay: 0.12s; }
.reveal:nth-of-type(4) { animation-delay: 0.18s; }
.reveal:nth-of-type(5) { animation-delay: 0.24s; }
@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

.masthead {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--panel-edge);
  padding-bottom: 18px;
  margin-bottom: 26px;
}

.masthead-title { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }

.sigil { color: var(--pass); font-size: 18px; text-shadow: 0 0 12px rgba(75, 227, 139, 0.7); }

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.38em;
  color: #e9f3ec;
}

.subtitle { color: var(--dim); letter-spacing: 0.08em; }

.masthead-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.commit-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dim);
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.commit-filter select {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--panel-edge);
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  padding: 6px 10px;
  min-width: 220px;
}

.masthead-meta { color: var(--faint); font-size: 11.5px; text-align: right; letter-spacing: 0.04em; }
.masthead-meta b { color: var(--dim); font-weight: 400; }

.kpi-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 22px;
}

.kpi {
  border: 1px solid var(--panel-edge);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent), var(--panel);
  padding: 14px 16px 12px;
  position: relative;
  overflow: hidden;
}

.kpi::after {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), transparent 70%);
  opacity: 0.55;
}

.kpi .label { color: var(--dim); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.22em; }
.kpi .value { font-size: 24px; color: #eef6f0; margin-top: 4px; }
.kpi .value.pass { color: var(--pass); text-shadow: 0 0 16px rgba(75, 227, 139, 0.35); }
.kpi .value.fail { color: var(--fail); text-shadow: 0 0 16px rgba(255, 98, 89, 0.3); }
.kpi .hint { color: var(--faint); font-size: 11px; }

.panel {
  border: 1px solid var(--panel-edge);
  background: var(--panel);
  margin-bottom: 22px;
  padding: 18px 20px 20px;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.panel-head h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  color: #dfeae2;
}

.index { color: var(--accent); margin-right: 8px; }
.panel-note { color: var(--faint); font-size: 11px; letter-spacing: 0.06em; }

table { border-collapse: collapse; width: 100%; }
th, td { padding: 7px 12px; text-align: left; border-bottom: 1px solid var(--grid-line); white-space: nowrap; }
th { color: var(--dim); font-weight: 400; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.18em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:hover td { background: rgba(255, 255, 255, 0.018); }

.rate-pass { color: var(--pass); }
.rate-mid { color: var(--cache); }
.rate-fail { color: var(--fail); }

.bar {
  display: inline-block;
  width: 140px;
  height: 7px;
  background: rgba(255, 255, 255, 0.05);
  vertical-align: middle;
  margin-right: 10px;
  position: relative;
}

.bar i {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, rgba(75, 227, 139, 0.55), var(--pass));
  box-shadow: 0 0 10px rgba(75, 227, 139, 0.35);
}

.bar.low i { background: linear-gradient(90deg, rgba(255, 98, 89, 0.5), var(--fail)); box-shadow: 0 0 10px rgba(255, 98, 89, 0.3); }
.bar.mid i { background: linear-gradient(90deg, rgba(227, 179, 79, 0.5), var(--cache)); box-shadow: 0 0 10px rgba(227, 179, 79, 0.3); }

.rank { color: var(--faint); }
tr:first-child .rank { color: var(--cache); }

.matrix-scroll { overflow-x: auto; }
.matrix-scroll th.suite-col { position: sticky; left: 0; background: var(--panel); }
.matrix-scroll td.suite-name { position: sticky; left: 0; background: var(--panel); color: var(--dim); max-width: 340px; overflow: hidden; text-overflow: ellipsis; }

td.cell { text-align: center; cursor: pointer; font-variant-numeric: tabular-nums; transition: transform 0.08s ease-out; }
td.cell:hover { transform: scale(1.06); outline: 1px solid var(--accent); }
td.cell.empty { color: var(--faint); cursor: default; }
td.cell.empty:hover { transform: none; outline: none; }

.routing-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.routing-controls label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dim);
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.routing-controls select {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--panel-edge);
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  padding: 6px 10px;
  min-width: 220px;
}

.routing-summary {
  color: var(--dim);
  font-size: 12px;
  margin-bottom: 12px;
  line-height: 1.6;
}

.routing-suite {
  color: var(--accent);
}

td.cell.parity-match {
  box-shadow: inset 0 0 0 1px var(--accent);
}

td.cell.parity-match::after {
  content: "◆";
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 8px;
  color: var(--accent);
  opacity: 0.9;
}

td.cell {
  position: relative;
}

.inspector-controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }

select, input[type="search"] {
  background: #0b110e;
  border: 1px solid var(--panel-edge);
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  padding: 6px 10px;
  outline: none;
}

select:focus, input[type="search"]:focus { border-color: var(--accent); }
input[type="search"] { flex: 1; min-width: 160px; }
.toggle { color: var(--dim); display: inline-flex; align-items: center; gap: 6px; }
.toggle input { accent-color: var(--pass); }

.trend-wrap { margin: 4px 0 18px; }
.trend-wrap svg { display: block; width: 100%; height: 150px; }
.trend-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px; color: var(--dim); font-size: 11px; }
.trend-legend .chip { display: inline-block; width: 10px; height: 3px; margin-right: 6px; vertical-align: middle; }

.status { font-weight: 700; letter-spacing: 0.1em; }
.status.pass { color: var(--pass); }
.status.fail { color: var(--fail); }
.tag { color: var(--cache); font-size: 10.5px; border: 1px solid rgba(227, 179, 79, 0.4); padding: 0 5px; margin-left: 8px; }

tr.test-row { cursor: pointer; }
tr.test-row td.test-name { white-space: normal; }
tr.detail-row td {
  white-space: normal;
  background: #0b110e;
  color: var(--dim);
  font-size: 12px;
  padding: 12px 16px;
}

.detail-block { margin-bottom: 10px; }
.detail-block:last-child { margin-bottom: 0; }
.detail-label { color: var(--faint); text-transform: uppercase; font-size: 10px; letter-spacing: 0.2em; margin-bottom: 3px; }
.detail-block pre { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text); font-family: var(--mono); font-size: 11.5px; }
.criterion { margin-bottom: 6px; }
.criterion .status { margin-right: 8px; }

.empty-state { color: var(--faint); padding: 18px 4px; letter-spacing: 0.08em; }

footer { color: var(--faint); font-size: 11px; }
footer ul { margin: 6px 0 0; padding-left: 18px; }
`;

const JS = `
const fmtPct = (passed, total) => total === 0 ? "–" : Math.round((passed / total) * 100) + "%";
const rateClass = (passed, total) => {
  if (total === 0) return "";
  const r = passed / total;
  if (r >= 0.99) return "rate-pass";
  if (r >= 0.7) return "rate-mid";
  return "rate-fail";
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtUsd = (v) => v == null ? "–" : "$" + v.toFixed(v >= 1 ? 2 : 4);
const fmtNum = (v) => v == null ? "–" : v.toLocaleString("en-US");
const fmtMs = (v) => v == null ? "–" : v >= 10000 ? (v / 1000).toFixed(1) + "s" : Math.round(v) + "ms";
const fmtAge = (iso) => {
  if (!iso) return "–";
  const mins = Math.round((new Date(DATA.generatedAt) - new Date(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 60 * 48) return Math.round(mins / 60) + "h ago";
  return Math.round(mins / 1440) + "d ago";
};
const shortSha = (sha) => (sha ? sha.slice(0, 7) : "–");

// Distinct from the pass/fail greens and reds so trend lines read as
// model identity, not status.
const PALETTE = ["#6fd6c9", "#9d8cff", "#e3b34f", "#5fa8ff", "#ff8e6b", "#ff6fb3", "#b5e36b", "#d8c9a3"];
const modelColor = (model) => {
  const models = activeView().models;
  return PALETTE[Math.max(0, models.indexOf(model)) % PALETTE.length];
};

// Lower index = cheaper model (rough eval cost order; tie-break when spend data is missing).
const MODEL_COST_RANK = {
  "DeepSeek V4 Flash Azure": 0,
  "Gemini 3.1 Flash Lite": 1,
  "GPT-5.4 Nano": 2,
  "Gemini 2.5 Flash": 3,
  "GPT-5.4 Mini": 4,
  "DeepSeek V4 Pro Azure": 5,
  "Gemini 3 Flash": 6,
};

const state = {
  viewKey: DATA.defaultViewKey,
  baselineModel: "",
  suite: null,
  model: "",
  failuresOnly: false,
  search: "",
};

function activeView() {
  return DATA.views.find((view) => view.key === state.viewKey) || DATA.views[0];
}

function latestStats(tests, model) {
  let passed = 0, total = 0;
  for (const t of tests) {
    if (model && t.model !== model) continue;
    total += 1;
    if (t.pass) passed += 1;
  }
  return { passed, total };
}

function modelCostRank(model) {
  return model in MODEL_COST_RANK ? MODEL_COST_RANK[model] : 99;
}

function isCheaperThan(candidate, baseline) {
  return modelCostRank(candidate) < modelCostRank(baseline);
}

function defaultBaselineModel(view) {
  return view.leaderboard[0]?.model || view.models[0] || "";
}

function suiteParity(baselineStats, candidateStats) {
  if (baselineStats.total === 0 || candidateStats.total === 0) {
    return null;
  }
  if (candidateStats.passed === baselineStats.passed) {
    return "parity";
  }
  const gap = baselineStats.passed - candidateStats.passed;
  const rateGap =
    baselineStats.passed / baselineStats.total -
    candidateStats.passed / candidateStats.total;
  if (gap === 1 || (gap <= 2 && rateGap <= 0.05)) {
    return "close";
  }
  return "worse";
}

function syncBaselineSelect() {
  const view = activeView();
  const select = document.getElementById("baseline-select");
  if (!state.baselineModel || !view.models.includes(state.baselineModel)) {
    state.baselineModel = defaultBaselineModel(view);
  }
  select.innerHTML = view.models.map((model) => {
    const row = view.leaderboard.find((item) => item.model === model);
    const hint = row ? fmtPct(row.passed, row.total) + " overall" : "in view";
    return '<option value="' + esc(model) + '"' + (model === state.baselineModel ? " selected" : "") + ">" +
      esc(model) + " — " + esc(hint) + "</option>";
  }).join("");
}

function renderCommitSelect() {
  const select = document.getElementById("commit-select");
  select.innerHTML = DATA.views.map((view) => {
    const hint = view.key === "all"
      ? "mixed history"
      : view.runCount + " run" + (view.runCount === 1 ? "" : "s") + " · " + fmtAge(view.lastRunAt);
    return '<option value="' + esc(view.key) + '"' + (view.key === state.viewKey ? " selected" : "") + ">" +
      esc(view.label) + " — " + esc(hint) + "</option>";
  }).join("");
}

function renderMasthead() {
  const view = activeView();
  const commitLine = view.key === "all"
    ? "showing <b>all commits</b> (latest-wins per test — may mix stale results)"
    : view.key === "legacy"
      ? "showing <b>legacy runs</b> without a recorded commit"
      : "showing commit <b>" + esc(shortSha(view.gitHead)) + "</b>";
  document.getElementById("masthead-meta").innerHTML =
    "generated <b>" + esc(new Date(DATA.generatedAt).toLocaleString()) + "</b><br/>" +
    esc(DATA.historyDir) + " · " + view.runCount + " run file" + (view.runCount === 1 ? "" : "s") + " · " + commitLine;
}

function renderKpis() {
  const view = activeView();
  const all = view.suites.flatMap((s) => s.latestTests);
  const { passed, total } = latestStats(all, "");
  const rate = total ? passed / total : 0;
  const kpis = [
    { label: "pass rate", value: fmtPct(passed, total), cls: rate >= 0.9 ? "pass" : rate >= 0.7 ? "" : "fail", hint: passed + "/" + total + " for this commit" },
    { label: "suites", value: view.suites.length, hint: "with results on this commit" },
    { label: "models", value: view.models.length, hint: "in this view" },
    { label: "runs recorded", value: view.runCount, hint: "history files for commit" },
    { label: "est. spend", value: fmtUsd(view.cost.totalEstimatedCost), hint: fmtNum(view.cost.totalTokens) + " tokens" },
  ];
  document.getElementById("kpi-strip").innerHTML = kpis.map((k) =>
    '<div class="kpi"><div class="label">' + esc(k.label) + '</div><div class="value ' + (k.cls || "") + '">' + esc(k.value) + '</div><div class="hint">' + esc(k.hint) + "</div></div>"
  ).join("");
}

function renderLeaderboard() {
  const view = activeView();
  const note = document.getElementById("leaderboard-note");
  note.textContent = view.key === "all"
    ? "latest result per suite · test · model (all commits)"
    : "latest result per suite · test · model on " + view.label;
  if (view.leaderboard.length === 0) {
    document.getElementById("leaderboard").innerHTML = '<div class="empty-state">no eval history found</div>';
    return;
  }
  const rows = view.leaderboard.map((row, i) => {
    const rate = row.total ? row.passed / row.total : 0;
    const barCls = rate >= 0.99 ? "" : rate >= 0.7 ? "mid" : "low";
    return "<tr>" +
      '<td class="rank">' + String(i + 1).padStart(2, "0") + "</td>" +
      "<td>" + esc(row.model) + "</td>" +
      '<td><span class="bar ' + barCls + '"><i style="width:' + (rate * 100).toFixed(1) + '%"></i></span><span class="' + rateClass(row.passed, row.total) + '">' + fmtPct(row.passed, row.total) + "</span></td>" +
      '<td class="num">' + row.passed + "/" + row.total + "</td>" +
      '<td class="num">' + row.suiteCount + "</td>" +
      '<td class="num">' + fmtMs(row.avgDurationMs) + "</td>" +
      '<td class="num">' + fmtAge(row.lastRunAt) + "</td>" +
      "</tr>";
  }).join("");
  document.getElementById("leaderboard").innerHTML =
    "<table><thead><tr><th></th><th>model</th><th>pass rate</th><th class=\\"num\\">passed</th><th class=\\"num\\">suites</th><th class=\\"num\\">avg latency</th><th class=\\"num\\">last run</th></tr></thead><tbody>" + rows + "</tbody></table>";
}

function cellStyle(passed, total) {
  if (total === 0) return "";
  const r = passed / total;
  if (r >= 0.99) return "background:rgba(75,227,139,0.13);color:var(--pass)";
  if (r >= 0.7) return "background:rgba(227,179,79,0.12);color:var(--cache)";
  return "background:rgba(255,98,89,0.13);color:var(--fail)";
}

function renderMatrix() {
  const view = activeView();
  const baseline = state.baselineModel || defaultBaselineModel(view);
  document.getElementById("matrix-note").textContent =
    "click a cell to inspect · ◆ = same pass count as " + baseline + " on that suite";
  if (view.suites.length === 0 || view.models.length === 0) {
    document.getElementById("matrix").innerHTML = '<div class="empty-state">no eval history found</div>';
    return;
  }
  const head = '<tr><th class="suite-col">suite</th>' + view.models.map((m) => "<th>" + esc(m) + "</th>").join("") + "</tr>";
  const rows = view.suites.map((suite) => {
    const baselineStats = latestStats(suite.latestTests, baseline);
    const cells = view.models.map((model) => {
      const { passed, total } = latestStats(suite.latestTests, model);
      if (total === 0) return '<td class="cell empty">·</td>';
      const parity = suiteParity(baselineStats, { passed, total });
      const parityCls =
        model !== baseline &&
        isCheaperThan(model, baseline) &&
        parity === "parity"
          ? " parity-match"
          : "";
      const title = suite.name + " · " + model +
        (parityCls ? " · matches " + baseline + " (" + passed + "/" + total + ")" : "");
      return '<td class="cell' + parityCls + '" style="' + cellStyle(passed, total) + '" data-suite="' + esc(suite.name) + '" data-model="' + esc(model) + '" title="' + esc(title) + '">' + passed + "/" + total + "</td>";
    }).join("");
    return '<tr><td class="suite-name" title="' + esc(suite.name) + '">' + esc(suite.name) + "</td>" + cells + "</tr>";
  }).join("");
  const el = document.getElementById("matrix");
  el.innerHTML = "<table>" + head + rows + "</table>";
  el.querySelectorAll("td.cell[data-suite]").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.suite = cell.dataset.suite;
      state.model = cell.dataset.model;
      syncControls();
      renderInspector();
      document.getElementById("suite-select").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function renderCostRouting() {
  const view = activeView();
  const el = document.getElementById("routing");
  const baseline = state.baselineModel || defaultBaselineModel(view);
  const note = document.getElementById("routing-note");
  note.textContent =
    "cheaper models with the same pass count as " + baseline + " on a suite are safe cost-down candidates";

  const candidates = view.models
    .filter((model) => model !== baseline && isCheaperThan(model, baseline))
    .sort((a, b) => modelCostRank(a) - modelCostRank(b));

  if (candidates.length === 0) {
    el.innerHTML = '<div class="empty-state">no cheaper models in this view to compare</div>';
    return;
  }

  const rows = [];
  let totalParitySuites = 0;
  for (const candidate of candidates) {
    const paritySuites = [];
    const closeSuites = [];
    let compared = 0;
    for (const suite of view.suites) {
      const baselineStats = latestStats(suite.latestTests, baseline);
      const candidateStats = latestStats(suite.latestTests, candidate);
      const parity = suiteParity(baselineStats, candidateStats);
      if (!parity) continue;
      compared += 1;
      if (parity === "parity") {
        paritySuites.push(suite.name);
      } else if (parity === "close") {
        closeSuites.push(suite.name);
      }
    }
    totalParitySuites += paritySuites.length;
    const parityList = paritySuites.length
      ? paritySuites.map((name) => '<span class="routing-suite">' + esc(name) + "</span>").join(", ")
      : '<span class="faint">none</span>';
    const closeList = closeSuites.length
      ? closeSuites.map((name) => esc(name)).join(", ")
      : "–";
    rows.push(
      "<tr>" +
        "<td>" + esc(candidate) + "</td>" +
        '<td class="num">' + compared + "</td>" +
        '<td class="num">' + paritySuites.length + "</td>" +
        "<td>" + parityList + "</td>" +
        '<td class="num">' + closeSuites.length + "</td>" +
        "<td>" + esc(closeList) + "</td>" +
      "</tr>",
    );
  }

  const summary =
    totalParitySuites === 0
      ? "No full parity yet on this commit — expand coverage or use ◆ cells in the matrix to spot near-matches."
      : totalParitySuites + " suite" + (totalParitySuites === 1 ? "" : "s") +
        " where a cheaper model already matches " + baseline + " pass-for-pass. Route those first when optimizing cost.";

  el.innerHTML =
    '<div class="routing-summary">' + esc(summary) + "</div>" +
    "<table><thead><tr><th>cheaper model</th><th class=\\"num\\">compared</th><th class=\\"num\\">parity</th><th>parity suites</th><th class=\\"num\\">close</th><th>close suites (≤1 miss or ≤5pp)</th></tr></thead><tbody>" +
    rows.join("") +
    "</tbody></table>";
}

function syncControls() {
  const view = activeView();
  const suiteSelect = document.getElementById("suite-select");
  suiteSelect.innerHTML = view.suites.map((s) => '<option value="' + esc(s.name) + '"' + (s.name === state.suite ? " selected" : "") + ">" + esc(s.name) + "</option>").join("");
  const suite = view.suites.find((s) => s.name === state.suite);
  const models = suite ? Array.from(new Set(suite.latestTests.map((t) => t.model))).sort() : [];
  if (state.model && !models.includes(state.model)) state.model = "";
  document.getElementById("model-select").innerHTML =
    '<option value="">all models</option>' +
    models.map((m) => '<option value="' + esc(m) + '"' + (m === state.model ? " selected" : "") + ">" + esc(m) + "</option>").join("");
  document.getElementById("failures-only").checked = state.failuresOnly;
}

function renderTrend(suite) {
  const wrap = document.getElementById("trend");
  if (!suite || suite.runs.length < 2) { wrap.innerHTML = ""; return; }

  const runs = suite.runs;
  const models = Array.from(new Set(runs.flatMap((r) => r.perModel.map((p) => p.model)))).sort();
  const W = 900, H = 150, PAD = { l: 38, r: 12, t: 12, b: 22 };
  const x = (i) => PAD.l + (i / Math.max(1, runs.length - 1)) * (W - PAD.l - PAD.r);
  const y = (rate) => PAD.t + (1 - rate) * (H - PAD.t - PAD.b);

  let svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
  for (const g of [0, 0.5, 1]) {
    svg += '<line x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="#16201a" stroke-width="1"/>';
    svg += '<text x="' + (PAD.l - 6) + '" y="' + (y(g) + 3) + '" fill="#4a584f" font-size="9" text-anchor="end" font-family="inherit">' + g * 100 + "%</text>";
  }
  for (const model of models) {
    const pts = [];
    runs.forEach((run, i) => {
      const pm = run.perModel.find((p) => p.model === model);
      if (pm && pm.total > 0) pts.push({ i, rate: pm.passed / pm.total, run, pm });
    });
    if (pts.length === 0) continue;
    const color = modelColor(model);
    const dattr = pts.map((p, j) => (j === 0 ? "M" : "L") + x(p.i).toFixed(1) + "," + y(p.rate).toFixed(1)).join(" ");
    svg += '<path d="' + dattr + '" fill="none" stroke="' + color + '" stroke-width="1.5" opacity="0.85"/>';
    for (const p of pts) {
      svg += '<circle cx="' + x(p.i).toFixed(1) + '" cy="' + y(p.rate).toFixed(1) + '" r="2.6" fill="' + color + '"><title>' +
        esc(model + " · " + p.pm.passed + "/" + p.pm.total + " · " + new Date(p.run.createdAt).toLocaleString() + (p.run.gitHead ? " · " + shortSha(p.run.gitHead) : "")) + "</title></circle>";
    }
  }
  svg += "</svg>";

  wrap.innerHTML = '<div class="trend-wrap">' + svg +
    '<div class="trend-legend">' + models.map((m) =>
      '<span><span class="chip" style="background:' + modelColor(m) + '"></span>' + esc(m) + "</span>"
    ).join("") + "</div></div>";
}

function detailHtml(test) {
  const blocks = [];
  if (test.expected !== undefined) blocks.push({ label: "expected", body: test.expected });
  if (test.actual !== undefined) blocks.push({ label: "actual", body: test.actual });
  let html = blocks.map((b) =>
    '<div class="detail-block"><div class="detail-label">' + b.label + "</div><pre>" + esc(b.body) + "</pre></div>"
  ).join("");
  if (test.criteria && test.criteria.length > 0) {
    html += '<div class="detail-block"><div class="detail-label">judge criteria</div>' +
      test.criteria.map((c) =>
        '<div class="criterion"><span class="status ' + (c.pass ? "pass" : "fail") + '">' + (c.pass ? "PASS" : "FAIL") + "</span>" + esc(c.criterion) + " — " + esc(c.reasoning) + "</div>"
      ).join("") + "</div>";
  }
  return html || '<div class="detail-block"><pre>no recorded detail</pre></div>';
}

function renderTests(suite) {
  const el = document.getElementById("tests");
  if (!suite) { el.innerHTML = '<div class="empty-state">no suite selected</div>'; return; }

  const q = state.search.toLowerCase();
  const tests = suite.latestTests.filter((t) =>
    (!state.model || t.model === state.model) &&
    (!state.failuresOnly || !t.pass) &&
    (!q || t.testName.toLowerCase().includes(q))
  );

  const { passed, total } = latestStats(tests, "");
  document.getElementById("inspector-note").textContent =
    total === 0 ? "" : passed + "/" + total + " passing in view";

  if (tests.length === 0) {
    el.innerHTML = '<div class="empty-state">nothing matches the current filters</div>';
    return;
  }

  const rows = tests.map((t, i) =>
    '<tr class="test-row" data-i="' + i + '">' +
      '<td><span class="status ' + (t.pass ? "pass" : "fail") + '">' + (t.pass ? "PASS" : "FAIL") + "</span>" + (t.cached ? '<span class="tag">cached</span>' : "") + "</td>" +
      '<td class="test-name">' + esc(t.testName) + "</td>" +
      "<td>" + esc(t.model) + "</td>" +
      '<td class="num">' + fmtMs(t.durationMs) + "</td>" +
      '<td class="num">' + fmtAge(t.createdAt) + "</td>" +
    "</tr>" +
    '<tr class="detail-row" data-i="' + i + '" hidden><td colspan="5">' + detailHtml(t) + "</td></tr>"
  ).join("");

  el.innerHTML = "<table><thead><tr><th>status</th><th>test</th><th>model</th><th class=\\"num\\">duration</th><th class=\\"num\\">when</th></tr></thead><tbody>" + rows + "</tbody></table>";
  el.querySelectorAll("tr.test-row").forEach((row) => {
    row.addEventListener("click", () => {
      const detail = el.querySelector('tr.detail-row[data-i="' + row.dataset.i + '"]');
      detail.hidden = !detail.hidden;
    });
  });
}

function renderInspector() {
  const view = activeView();
  const suite = view.suites.find((s) => s.name === state.suite);
  renderTrend(suite);
  renderTests(suite);
}

function renderCost() {
  const view = activeView();
  const el = document.getElementById("cost");
  const note = document.getElementById("cost-note");
  note.textContent = view.key === "all" ? "summed across all recorded runs" : "summed for commit " + view.label;
  if (view.cost.byModel.length === 0) {
    el.innerHTML = '<div class="empty-state">no usage data recorded</div>';
    return;
  }
  const rows = view.cost.byModel.map((m) =>
    "<tr><td>" + esc(m.key) + "</td>" +
    '<td class="num">' + fmtNum(m.calls) + "</td>" +
    '<td class="num">' + fmtUsd(m.estimatedCost) + "</td>" +
    '<td class="num">' + fmtUsd(m.reportedCost) + "</td>" +
    '<td class="num">' + fmtNum(m.totalTokens) + "</td></tr>"
  ).join("");
  el.innerHTML = "<table><thead><tr><th>provider:model</th><th class=\\"num\\">calls</th><th class=\\"num\\">estimated</th><th class=\\"num\\">reported</th><th class=\\"num\\">tokens</th></tr></thead><tbody>" + rows +
    '<tr><td><b>total</b></td><td class="num">' + fmtNum(view.cost.totalCalls) + '</td><td class="num">' + fmtUsd(view.cost.totalEstimatedCost) + '</td><td class="num">' + fmtUsd(view.cost.totalReportedCost) + '</td><td class="num">' + fmtNum(view.cost.totalTokens) + "</td></tr></tbody></table>";
}

function renderWarnings() {
  const el = document.getElementById("warnings");
  if (DATA.warnings.length === 0) { el.innerHTML = ""; return; }
  el.innerHTML = "⚠ " + DATA.warnings.length + " file(s) skipped:<ul>" + DATA.warnings.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul>";
}

function pickDefaultSuite() {
  const view = activeView();
  let best = null, bestAt = "";
  for (const suite of view.suites) {
    const last = suite.runs[suite.runs.length - 1];
    if (last && last.createdAt > bestAt) { best = suite.name; bestAt = last.createdAt; }
  }
  return best || (view.suites[0] && view.suites[0].name) || null;
}

function renderAll() {
  renderMasthead();
  renderKpis();
  renderLeaderboard();
  syncBaselineSelect();
  renderMatrix();
  renderCostRouting();
  if (!activeView().suites.some((suite) => suite.name === state.suite)) {
    state.suite = pickDefaultSuite();
    state.model = "";
  }
  syncControls();
  renderInspector();
  renderCost();
}

document.getElementById("commit-select").addEventListener("change", (e) => {
  state.viewKey = e.target.value;
  state.baselineModel = "";
  state.suite = pickDefaultSuite();
  state.model = "";
  renderAll();
});

document.getElementById("baseline-select").addEventListener("change", (e) => {
  state.baselineModel = e.target.value;
  renderMatrix();
  renderCostRouting();
});

document.getElementById("suite-select").addEventListener("change", (e) => { state.suite = e.target.value; syncControls(); renderInspector(); });
document.getElementById("model-select").addEventListener("change", (e) => { state.model = e.target.value; renderInspector(); });
document.getElementById("failures-only").addEventListener("change", (e) => { state.failuresOnly = e.target.checked; renderInspector(); });
document.getElementById("search").addEventListener("input", (e) => { state.search = e.target.value; renderInspector(); });

renderCommitSelect();
state.suite = pickDefaultSuite();
renderAll();
renderWarnings();
`;
