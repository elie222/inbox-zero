import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, type UtilityProcess, utilityProcess } from "electron";
import { createDesktopMailProcessOwner } from "../../src/mail-engine/utility-host";
import { closeAndWipeDesktopMailbox } from "../../src/mail-engine/wipe";

const SESSION_COOKIE = "session=electron-smoke";

app.whenReady().then(() =>
  runSmoke().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    app.exit(1);
  }),
);

async function runSmoke() {
  const directory = await mkdtemp(join(tmpdir(), "electron-mail-session-"));
  const databasePath = join(directory, "mailbox.sqlite");
  const cookies: string[] = [];
  const server = createServer((request, response) => {
    cookies.push(request.headers.cookie ?? "");
    response.writeHead(503, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  let child: UtilityProcess | undefined;
  const engineErrors: string[] = [];
  const owner = createDesktopMailProcessOwner({
    databasePath,
    origin: `http://127.0.0.1:${port}`,
    fork: () => {
      child = utilityProcess.fork(requiredEnv("ELECTRON_MAIL_CHILD"), [], {
        serviceName: "Inbox Zero Mail Engine",
      });
      return child;
    },
    cookieHeader: async () => SESSION_COOKIE,
    onEngineError: (error) => engineErrors.push(error.message),
  });

  const pushed: string[] = [];
  owner.subscribe(
    {
      protocolVersion: 1,
      requestId: "electron-observe",
      method: "observeOperation",
      payload: { accountId: "acc-1", operationId: "archive-electron" },
    },
    (snapshot) => pushed.push(snapshotStatus(snapshot)),
  );
  const archive = (requestId: string) =>
    owner.handleIpc({
      protocolVersion: 1,
      requestId,
      method: "submitMetadata",
      payload: {
        accountId: "acc-1",
        commandId: "archive-electron",
        targets: [{ accountId: "acc-1", messageId: "m1" }],
        change: { kind: "archive" },
      },
    });
  const admitted = await archive("electron-archive");
  const duplicate = await archive("electron-archive-again");
  await waitFor(() => pushed.length > 0, "pushed snapshot");

  await owner.handleIpc({
    protocolVersion: 1,
    requestId: "electron-sync",
    method: "requestSync",
    payload: { accountIds: ["acc-1"] },
  });
  await waitFor(() => cookies.includes(SESSION_COOKIE), "cookie request");
  const health = await owner.health();

  const pushedBeforeCrash = pushed.length;
  child?.kill();
  await waitFor(
    () => pushed.length > pushedBeforeCrash,
    "snapshot after restart",
  );
  const diagnostics = await owner.handleIpc({
    protocolVersion: 1,
    requestId: "electron-diagnostics",
    method: "getDiagnostics",
    payload: { accountId: "acc-1" },
  });

  await closeAndWipeDesktopMailbox({ owner, databasePath });
  server.close();
  process.stdout.write(
    `ELECTRON_MAIL_SMOKE ${JSON.stringify({
      electron: process.versions.electron,
      admitted,
      duplicate,
      diagnostics,
      health,
      restarted: engineErrors.some((message) =>
        message.includes("exited unexpectedly"),
      ),
      wiped: !existsSync(databasePath),
    })}\n`,
  );
  app.quit();
}

function snapshotStatus(snapshot: unknown) {
  const data = (snapshot as { data?: { status?: string } }).data;
  return data?.status ?? "none";
}

async function waitFor(condition: () => boolean, label: string) {
  const deadline = Date.now() + 15_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
