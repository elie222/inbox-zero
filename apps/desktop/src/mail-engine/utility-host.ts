import { randomUUID } from "node:crypto";
import { isObservationRequest, parseMailIpcRequest } from "./ipc";
import type { DesktopMailOwner } from "./owner";
import type {
  ChildHealth,
  ChildToMainMessage,
  MainToChildMessage,
} from "./utility-child";

const RESTART_BASE_DELAY_MS = 1000;
const RESTART_MAX_DELAY_MS = 60_000;
// A child that stayed up this long is treated as healthy again, so a later
// crash restarts quickly instead of inheriting the old backoff.
const STABLE_UPTIME_MS = 60_000;
const CLOSE_TIMEOUT_MS = 5000;
const HEALTH_TIMEOUT_MS = 2000;

/** The Electron `UtilityProcess` surface the proxy uses. */
export type MailChildProcess = {
  postMessage(message: MainToChildMessage): void;
  on(
    event: "message",
    listener: (message: ChildToMainMessage) => void,
  ): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  kill(): boolean;
};

export type DesktopMailProcessOwner = DesktopMailOwner & {
  health(): Promise<{
    running: boolean;
    restarts: number;
    child: ChildHealth | null;
  }>;
};

/**
 * Main-process proxy for the mail engine running in a utility process. Keeps
 * session cookies and crash recovery here, and the engine and SQLite there.
 */
export function createDesktopMailProcessOwner(input: {
  databasePath: string;
  origin: string;
  fork: () => MailChildProcess;
  cookieHeader: (url: string) => Promise<string>;
  onEngineError: (error: Error) => void;
}): DesktopMailProcessOwner {
  const subscriptions = new Map<
    string,
    { payload: unknown; onSnapshot: (snapshot: unknown) => void }
  >();
  let current: RunningChild | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let consecutiveCrashes = 0;
  let restarts = 0;
  let closed = false;

  function spawn() {
    const child = input.fork();
    const channel: ChildChannel = { child, pending: new Map() };
    child.on("message", (message) => handleMessage(running, message));
    const exited = new Promise<void>((resolve) => {
      child.on("exit", (code) => {
        resolve();
        handleExit(running, code);
      });
    });
    const ready = call(channel, (id) => ({
      type: "start",
      id,
      databasePath: input.databasePath,
      origin: input.origin,
    })).then(() => {
      running.isReady = true;
      for (const [subscriptionId, { payload }] of subscriptions) {
        child.postMessage({ type: "subscribe", subscriptionId, payload });
      }
    });
    // A child that cannot open the mailbox is restarted with backoff. An exit
    // or close before start replies clears `current` or sets `closed` first,
    // and the exit handler already reports a crash.
    ready.catch((error: unknown) => {
      if (closed || running !== current) return;
      input.onEngineError(asError(error));
      running.exitReported = true;
      child.kill();
    });
    const running: RunningChild = {
      ...channel,
      startedAt: Date.now(),
      isReady: false,
      exitReported: false,
      ready,
      exited,
    };
    current = running;
    return running;
  }

  async function callReady(message: (id: string) => MainToChildMessage) {
    const running = requireChild();
    await running.ready;
    return call(running, message);
  }

  function requireChild() {
    if (closed) throw new Error("mail engine is closed");
    if (current) return current;
    if (restartTimer) throw new Error("mail engine is restarting");
    return spawn();
  }

  function handleMessage(running: RunningChild, message: ChildToMainMessage) {
    switch (message.type) {
      case "reply": {
        const waiter = running.pending.get(message.id);
        running.pending.delete(message.id);
        if (message.status === "ok") waiter?.resolve(message.result);
        else waiter?.reject(new Error(message.message));
        return;
      }
      case "snapshot":
        if (running === current) {
          subscriptions
            .get(message.subscriptionId)
            ?.onSnapshot(message.snapshot);
        }
        return;
      case "engineError": {
        const error = new Error(message.message);
        if (message.stack) error.stack = message.stack;
        input.onEngineError(error);
        return;
      }
      case "cookieHeaderRequest":
        readCookieHeader(message.url).then((cookieHeader) => {
          if (running !== current) return;
          running.child.postMessage({
            type: "cookieHeader",
            requestId: message.requestId,
            cookieHeader,
          });
        });
        return;
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  }

  // The child asks for cookies by URL, so only the app origin ever gets them.
  async function readCookieHeader(url: string) {
    if (URL.parse(url)?.origin !== new URL(input.origin).origin) return "";
    try {
      return await input.cookieHeader(url);
    } catch {
      return "";
    }
  }

  function handleExit(running: RunningChild, code: number) {
    for (const waiter of running.pending.values()) {
      waiter.reject(new Error("mail engine process exited"));
    }
    running.pending.clear();
    if (running !== current) return;
    current = undefined;
    if (closed) return;
    consecutiveCrashes =
      Date.now() - running.startedAt >= STABLE_UPTIME_MS
        ? 1
        : consecutiveCrashes + 1;
    const delay = Math.min(
      RESTART_MAX_DELAY_MS,
      RESTART_BASE_DELAY_MS * 2 ** (consecutiveCrashes - 1),
    );
    // Quitting or installing an update can kill the child before the app's
    // quit handlers run. Reporting only when the restart is still due, after
    // close() had its chance to cancel it, keeps those exits out of crash reports.
    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      if (!running.exitReported) {
        input.onEngineError(
          new Error(
            `mail engine process exited unexpectedly with code ${code}`,
          ),
        );
      }
      restarts += 1;
      spawn();
    }, delay);
  }

  spawn();

  return {
    async handleIpc(payload) {
      return (await callReady((id) => ({
        type: "ipc",
        id,
        payload,
      }))) as Awaited<ReturnType<DesktopMailOwner["handleIpc"]>>;
    },
    subscribe(payload, onSnapshot) {
      const parsed = parseMailIpcRequest(payload);
      if (!parsed.success || !isObservationRequest(parsed.data)) return null;
      const subscriptionId = randomUUID();
      subscriptions.set(subscriptionId, { payload, onSnapshot });
      // Before the child is ready, its start sends every subscription.
      if (current?.isReady) {
        current.child.postMessage({
          type: "subscribe",
          subscriptionId,
          payload,
        });
      }
      return () => {
        if (!subscriptions.delete(subscriptionId)) return;
        current?.child.postMessage({ type: "unsubscribe", subscriptionId });
      };
    },
    async recover() {
      await callReady((id) => ({ type: "recover", id }));
    },
    async health() {
      const running = current;
      if (!running?.isReady) return { running: false, restarts, child: null };
      const child = (await withTimeout(
        call(running, (id) => ({ type: "health", id })),
        HEALTH_TIMEOUT_MS,
      ).catch(() => null)) as ChildHealth | null;
      return { running: true, restarts, child };
    },
    async close() {
      closed = true;
      clearTimeout(restartTimer);
      restartTimer = undefined;
      subscriptions.clear();
      const running = current;
      if (!running) return;
      // Wipe deletes the database files next, so the child must be gone.
      await withTimeout(
        running.ready.then(() =>
          call(running, (id) => ({ type: "close", id })),
        ),
        CLOSE_TIMEOUT_MS,
      ).catch(() => undefined);
      running.child.kill();
      await running.exited;
    },
  };
}

type ChildChannel = {
  child: MailChildProcess;
  pending: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >;
};

type RunningChild = ChildChannel & {
  startedAt: number;
  isReady: boolean;
  /** Set when the reason for the exit was already reported. */
  exitReported: boolean;
  ready: Promise<void>;
  exited: Promise<void>;
};

function call(
  channel: ChildChannel,
  message: (id: string) => MainToChildMessage,
) {
  const id = randomUUID();
  return new Promise<unknown>((resolve, reject) => {
    channel.pending.set(id, { resolve, reject });
    channel.child.postMessage(message(id));
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
