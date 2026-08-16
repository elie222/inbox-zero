const MAX_HISTORY_LENGTH = 100;

type PlaywrightRun = {
  attempt: number;
  branch: string;
  createdAt: string;
  event: string;
  id: string;
  reportUrl: string;
  result: string;
  runNumber: number;
  runUrl: string;
  sha: string;
};

export function updatePlaywrightHistory(
  existingHistory: unknown,
  run: PlaywrightRun,
): PlaywrightRun[] {
  const history = Array.isArray(existingHistory)
    ? existingHistory.filter(isPlaywrightRun)
    : [];

  return [
    run,
    ...history.filter(
      (previousRun) =>
        previousRun.id !== run.id || previousRun.attempt !== run.attempt,
    ),
  ].slice(0, MAX_HISTORY_LENGTH);
}

export function renderPlaywrightDashboard(history: PlaywrightRun[]): string {
  const data = JSON.stringify(history).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Playwright · Inbox Zero</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #09090b; color: #fafafa; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #172554 0, #09090b 34rem); }
    main { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
    h1 { margin: 0; font-size: clamp(2rem, 6vw, 4.5rem); letter-spacing: -0.06em; }
    .eyebrow { margin: 0 0 10px; color: #93c5fd; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    .subtitle { margin: 10px 0 0; color: #a1a1aa; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .button { display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border: 1px solid #3f3f46; border-radius: 999px; color: #fafafa; text-decoration: none; background: rgba(24, 24, 27, 0.78); }
    .button:hover { border-color: #60a5fa; background: #172554; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
    .card, .table-wrap { border: 1px solid rgba(113, 113, 122, 0.38); border-radius: 18px; background: rgba(9, 9, 11, 0.78); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28); backdrop-filter: blur(16px); }
    .card { padding: 20px; }
    .label { color: #a1a1aa; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .value { display: block; margin-top: 8px; font-size: 1.5rem; font-weight: 700; }
    .table-wrap { overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 16px 18px; border-bottom: 1px solid rgba(63, 63, 70, 0.72); text-align: left; }
    th { color: #a1a1aa; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; }
    tbody tr:last-child td { border-bottom: 0; }
    tbody tr:hover { background: rgba(30, 41, 59, 0.5); }
    .status { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; text-transform: capitalize; }
    .status::before { width: 9px; height: 9px; border-radius: 50%; background: #f59e0b; content: ""; box-shadow: 0 0 18px currentColor; }
    .status.success { color: #4ade80; }
    .status.success::before { background: #4ade80; }
    .status.failure, .status.cancelled { color: #fb7185; }
    .status.failure::before, .status.cancelled::before { background: #fb7185; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .links { display: flex; gap: 14px; }
    .links a { color: #93c5fd; text-decoration: none; }
    .links a:hover { text-decoration: underline; }
    .empty { padding: 56px 24px; color: #a1a1aa; text-align: center; }
    footer { margin-top: 18px; color: #71717a; font-size: 0.8rem; text-align: right; }
    @media (max-width: 760px) {
      main { padding: 36px 0; }
      header { align-items: start; flex-direction: column; }
      .summary { grid-template-columns: 1fr; }
      .table-wrap { overflow-x: auto; }
      table { min-width: 760px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="eyebrow">Inbox Zero · browser checks</p>
        <h1>Playwright</h1>
        <p class="subtitle">Persistent results from the emulated end-to-end suite.</p>
      </div>
      <div class="actions">
        <a class="button" href="./latest/index.html" id="latest-report">Latest report</a>
        <a class="button" href="https://github.com/elie222/inbox-zero/actions/workflows/playwright.yml">GitHub Actions</a>
      </div>
    </header>

    <section class="summary" id="summary"></section>
    <section class="table-wrap">
      <table>
        <thead>
          <tr><th>Result</th><th>Run</th><th>Commit</th><th>Trigger</th><th>Published</th><th>Links</th></tr>
        </thead>
        <tbody id="runs"></tbody>
      </table>
      <div class="empty" id="empty" hidden>No Playwright runs have been published yet.</div>
    </section>
    <footer id="generated-at"></footer>
  </main>
  <script>
    const history = ${data};
    const runs = document.querySelector("#runs");
    const empty = document.querySelector("#empty");
    const summary = document.querySelector("#summary");
    const generatedAt = document.querySelector("#generated-at");
    const latestReport = document.querySelector("#latest-report");

    if (history.length === 0) {
      empty.hidden = false;
      latestReport.hidden = true;
    }

    const latest = history[0];
    const recent = history.slice(0, 10);
    const recentPassing = recent.filter((run) => run.result === "success").length;
    const cards = [
      ["Latest result", latest?.result ?? "No runs"],
      ["Recent pass rate", recent.length ? Math.round((recentPassing / recent.length) * 100) + "%" : "—"],
      ["Stored runs", String(history.length)],
    ];

    for (const [label, value] of cards) {
      const card = document.createElement("article");
      card.className = "card";
      const labelElement = document.createElement("span");
      labelElement.className = "label";
      labelElement.textContent = label;
      const valueElement = document.createElement("span");
      valueElement.className = "value";
      valueElement.textContent = value;
      card.append(labelElement, valueElement);
      summary.append(card);
    }

    for (const run of history) {
      const row = document.createElement("tr");
      const result = document.createElement("td");
      const status = document.createElement("span");
      status.className = "status " + run.result;
      status.textContent = run.result;
      result.append(status);

      const runNumber = document.createElement("td");
      runNumber.textContent = "#" + run.runNumber + " · attempt " + run.attempt;
      const commit = document.createElement("td");
      commit.className = "mono";
      commit.textContent = run.sha.slice(0, 7);
      const event = document.createElement("td");
      event.textContent = run.event + " · " + run.branch;
      const published = document.createElement("td");
      published.textContent = new Date(run.createdAt).toLocaleString();
      const links = document.createElement("td");
      links.className = "links";
      const report = document.createElement("a");
      report.href = run.reportUrl;
      report.textContent = "Report";
      const actions = document.createElement("a");
      actions.href = run.runUrl;
      actions.textContent = "Actions";
      links.append(report, actions);

      row.append(result, runNumber, commit, event, published, links);
      runs.append(row);
    }

    generatedAt.textContent = latest
      ? "Latest result published " + new Date(latest.createdAt).toLocaleString()
      : "Waiting for the first published run";
  </script>
</body>
</html>`;
}

function isPlaywrightRun(value: unknown): value is PlaywrightRun {
  if (!value || typeof value !== "object") return false;

  const run = value as Partial<PlaywrightRun>;
  return (
    typeof run.attempt === "number" &&
    typeof run.branch === "string" &&
    typeof run.createdAt === "string" &&
    typeof run.event === "string" &&
    typeof run.id === "string" &&
    typeof run.reportUrl === "string" &&
    typeof run.result === "string" &&
    typeof run.runNumber === "number" &&
    typeof run.runUrl === "string" &&
    typeof run.sha === "string"
  );
}
