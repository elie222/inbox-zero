import { randomUUID } from "node:crypto";
import { availableParallelism, homedir, totalmem } from "node:os";
import path from "node:path";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { MailDiagnostics } from "@inboxzero/mail-core/engine";
import type { MailStoreInspection } from "@inboxzero/mail-core/ports/mail-store";
import { MAIL_IPC_PROTOCOL_VERSION } from "@inboxzero/mail-core/protocol/mail-ipc";
import {
  app,
  BrowserWindow,
  clipboard,
  contentTracing,
  dialog,
  Notification,
  shell,
  type MessageBoxOptions,
  type TraceConfig,
} from "electron";
import {
  captureDesktopError,
  isDesktopSentryEnabled,
  sendDesktopDiagnostics,
} from "./sentry";

const RECORDING_MS = 30_000;
const MAIL_ENGINE_TIMEOUT_MS = 10_000;
const TRACE_FILE = "trace.json.gz";
const SNAPSHOT_FILE = "diagnostics.json";

// Timeline categories for main-thread and renderer work plus sampled JS stacks.
// Paint/layer snapshot and screenshot categories are left out because they
// capture rendered pixels and text.
const TRACE_CONFIG: TraceConfig = {
  recording_mode: "record-continuously",
  trace_buffer_size_in_kb: 64 * 1024,
  included_categories: [
    "toplevel",
    "ipc",
    "electron",
    "v8.execute",
    "blink.user_timing",
    "devtools.timeline",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame",
    "disabled-by-default-v8.cpu_profiler",
  ],
  excluded_categories: ["*"],
};

type MailEngineOwner = { handleIpc(payload: unknown): Promise<unknown> };

let recording = false;

export async function recordDesktopDiagnostics(input: {
  /** Undefined when the local mail engine hasn't been started this session. */
  getMailOwner: () => Promise<MailEngineOwner> | undefined;
  databasePath: string;
}) {
  if (recording) {
    await showMessage({
      type: "info",
      message: "Diagnostics are already recording",
      detail: "Wait for the current recording to finish.",
    });
    return;
  }
  recording = true;
  try {
    await recordDiagnostics(input);
  } catch (error) {
    captureDesktopError(error, { area: "diagnostics" });
    dialog.showErrorBox(
      "Could not record diagnostics",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    recording = false;
  }
}

export function diagnosticsFolderName(date: Date) {
  return `Inbox-Zero-Diagnostics-${date.toISOString().slice(0, 19).replaceAll(":", "-")}`;
}

/**
 * Keeps counts, statuses, and sync coverage only. Messages, operation targets,
 * command payloads, and assistant entries can carry mail content, so they are
 * dropped rather than filtered.
 */
export function summarizeMailEngine(
  inspection: MailStoreInspection,
  diagnostics: MailDiagnostics[],
) {
  return {
    status: "ok" as const,
    revision: inspection.revision,
    accounts: inspection.accounts.map((account) => {
      const accountDiagnostics = diagnostics.find(
        (item) => item.accountId === account.accountId,
      );
      return {
        accountId: account.accountId,
        provider: account.provider,
        connection: account.connection,
        syncStreams: inspection.streams.filter(
          (stream) => stream.accountId === account.accountId,
        ).length,
        coverage: inspection.coverage
          .filter((coverage) => coverage.accountId === account.accountId)
          .map((coverage) => ({
            scopeId: coverage.scopeId,
            metadata: coverage.metadata,
            content: coverage.content,
            indexedContent: coverage.indexedContent,
            lastCompletedSyncAtMs: coverage.lastCompletedSyncAtMs,
          })),
        queue: accountDiagnostics
          ? {
              pendingOperations: accountDiagnostics.pendingOperations,
              uncertainOperations: accountDiagnostics.uncertainOperations,
              pendingJobs: accountDiagnostics.pendingJobs,
              oldestPendingAtMs: accountDiagnostics.oldestPendingAtMs,
              commands: countBy(
                accountDiagnostics.commands,
                (command) => `${command.kind}:${command.status}`,
              ),
            }
          : null,
      };
    }),
  };
}

/**
 * Drops query strings and fragments from URL values in trace JSON. Rewriting
 * the text avoids parsing a trace that can reach tens of megabytes on the main
 * process.
 */
export function stripTraceUrlQueries(json: string) {
  return json.replace(/"(https?:\/\/[^"?#\\]*)[?#](?:[^"\\]|\\.)*"/gi, '"$1"');
}

/** Local file paths in a trace include the OS username. */
export function redactHomeDirectory(json: string, home: string) {
  if (!home) return json;
  const escaped = JSON.stringify(home).slice(1, -1);
  return json.split(escaped).join("~").split(home).join("~");
}

async function recordDiagnostics({
  getMailOwner,
  databasePath,
}: {
  getMailOwner: () => Promise<MailEngineOwner> | undefined;
  databasePath: string;
}) {
  const { response } = await showMessage({
    type: "info",
    buttons: ["Start", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    message: "Record Diagnostics",
    detail:
      "Inbox Zero will record 30 seconds of performance data while you reproduce the problem. It includes timings and app state, not email content.",
  });
  if (response !== 0) return;

  const startedAt = new Date();
  const folder = path.join(
    app.getPath("downloads"),
    diagnosticsFolderName(startedAt),
  );
  // CPU usage in app metrics covers the time since the previous call, so this
  // sample makes the final one cover the recording.
  const processesAtStart = app.getAppMetrics();
  await contentTracing.startRecording(TRACE_CONFIG);
  await waitForRecording();
  const rawTracePath = await contentTracing.stopRecording(
    path.join(app.getPath("temp"), `${diagnosticsFolderName(startedAt)}.json`),
  );
  const stoppedAt = new Date();

  await mkdir(folder, { recursive: true });
  const trace = redactHomeDirectory(
    stripTraceUrlQueries(await readFile(rawTracePath, "utf8")),
    homedir(),
  );
  await rm(rawTracePath, { force: true });
  const traceData = await promisify(gzip)(trace);
  const snapshotData = Buffer.from(
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        durationMs: stoppedAt.getTime() - startedAt.getTime(),
        app: { version: app.getVersion(), packaged: app.isPackaged },
        versions: {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
        },
        os: {
          platform: process.platform,
          arch: process.arch,
          version: process.getSystemVersion(),
          cpuCount: availableParallelism(),
          totalMemoryBytes: totalmem(),
        },
        systemMemoryKb: process.getSystemMemoryInfo(),
        processesAtStart,
        processesAtEnd: app.getAppMetrics(),
        mailDatabaseBytes: await mailDatabaseSizes(databasePath),
        mailEngine: await collectMailEngine(getMailOwner),
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(folder, TRACE_FILE), traceData);
  await writeFile(path.join(folder, SNAPSHOT_FILE), snapshotData);
  shell.showItemInFolder(folder);

  if (!isDesktopSentryEnabled()) {
    await showMessage({
      type: "info",
      message: "Diagnostics saved",
      detail: `Saved to ${folder}. Send these files to Inbox Zero support.`,
    });
    return;
  }

  const send = await showMessage({
    type: "info",
    buttons: ["Send to Inbox Zero", "Done"],
    defaultId: 0,
    cancelId: 1,
    message: "Diagnostics saved",
    detail: `Saved to ${folder}. Send them to Inbox Zero so we can look into the problem.`,
  });
  if (send.response !== 0) return;

  const eventId = await sendDesktopDiagnostics([
    { filename: TRACE_FILE, data: traceData },
    { filename: SNAPSHOT_FILE, data: snapshotData },
  ]);
  if (!eventId) {
    await showMessage({
      type: "warning",
      message: "Could not send diagnostics",
      detail: `Send the files in ${folder} to Inbox Zero support instead.`,
    });
    return;
  }
  const sent = await showMessage({
    type: "info",
    buttons: ["Copy ID", "Done"],
    defaultId: 0,
    cancelId: 1,
    message: "Diagnostics sent",
    detail: `Quote this ID when contacting support: ${eventId}`,
  });
  if (sent.response === 0) clipboard.writeText(eventId);
}

// A message box without a parent window is app-modal on macOS and would block
// reproducing the problem, so progress is shown as a notification instead.
function waitForRecording() {
  return new Promise<void>((resolve) => {
    const notification = Notification.isSupported()
      ? new Notification({
          title: "Recording diagnostics",
          body: "Reproduce the problem now. Recording stops after 30 seconds, or click to stop now.",
        })
      : null;
    const timer = setTimeout(finish, RECORDING_MS);
    function finish() {
      clearTimeout(timer);
      notification?.close();
      resolve();
    }
    notification?.on("click", finish);
    notification?.show();
  });
}

async function collectMailEngine(
  getMailOwner: () => Promise<MailEngineOwner> | undefined,
) {
  const ownerPromise = getMailOwner();
  if (!ownerPromise) return { status: "not_started" as const };
  try {
    return await withTimeout(
      (async () => {
        const owner = await ownerPromise;
        const inspection = await callMailEngine<MailStoreInspection>(
          owner,
          "inspect",
          {},
        );
        const diagnostics = await Promise.all(
          inspection.accounts.map((account) =>
            callMailEngine<MailDiagnostics>(owner, "getDiagnostics", {
              accountId: account.accountId,
            }),
          ),
        );
        return summarizeMailEngine(inspection, diagnostics);
      })(),
      MAIL_ENGINE_TIMEOUT_MS,
    );
  } catch (error) {
    return {
      status: "unavailable" as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function callMailEngine<T>(
  owner: MailEngineOwner,
  method: "inspect" | "getDiagnostics",
  payload: Record<string, unknown>,
) {
  const response = (await owner.handleIpc({
    protocolVersion: MAIL_IPC_PROTOCOL_VERSION,
    requestId: `diagnostics-${randomUUID()}`,
    method,
    payload,
  })) as { status: string; result?: T };
  if (response.status !== "ok") {
    throw new Error(`Mail engine ${method} returned ${response.status}`);
  }
  return response.result as T;
}

async function mailDatabaseSizes(databasePath: string) {
  const name = path.basename(databasePath);
  const sizes: Record<string, number | null> = {};
  for (const suffix of ["", "-wal", "-shm"]) {
    sizes[`${name}${suffix}`] = await stat(`${databasePath}${suffix}`).then(
      (file) => file.size,
      () => null,
    );
  }
  return sizes;
}

function showMessage(options: MessageBoxOptions) {
  const window = BrowserWindow.getFocusedWindow();
  return window
    ? dialog.showMessageBox(window, options)
    : dialog.showMessageBox(options);
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}
