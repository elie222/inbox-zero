import { randomUUID } from "node:crypto";
import {
  createDurationRecorder,
  type DurationSummary,
  startEventLoopDelayMonitor,
} from "../health";
import { isTransientNetworkError } from "../network-errors";
import { createRoutedBackendPorts } from "./backend";
import { createDesktopMailOwner, type DesktopMailOwner } from "./owner";
import { createOriginMailRequest } from "./request";

export type MainToChildMessage =
  | { type: "start"; id: string; databasePath: string; origin: string }
  | { type: "ipc"; id: string; payload: unknown }
  | { type: "subscribe"; subscriptionId: string; payload: unknown }
  | { type: "unsubscribe"; subscriptionId: string }
  | { type: "recover"; id: string }
  | { type: "close"; id: string }
  | { type: "health"; id: string }
  | { type: "cookieHeader"; requestId: string; cookieHeader: string };

export type ChildToMainMessage =
  | { type: "reply"; id: string; status: "ok"; result: unknown }
  | { type: "reply"; id: string; status: "error"; message: string }
  | { type: "snapshot"; subscriptionId: string; snapshot: unknown }
  | { type: "engineError"; message: string; stack?: string }
  | { type: "cookieHeaderRequest"; requestId: string; url: string };

export type ChildHealth = {
  eventLoopDelayMs: DurationSummary | null;
  /** From the call, so including time queued behind other transactions. */
  sqliteReadMs: DurationSummary | null;
  sqliteWriteMs: DurationSummary | null;
};

/**
 * Owns SQLite and the engine loop in the mail utility process, so long
 * synchronous database work never blocks the main process's window input.
 */
export function createUtilityChildRuntime(
  post: (message: ChildToMainMessage) => void,
) {
  let owner: DesktopMailOwner | undefined;
  const subscriptions = new Map<string, () => void>();
  const cookieRequests = new Map<string, (cookieHeader: string) => void>();
  const eventLoopDelay = startEventLoopDelayMonitor();
  const sqliteReads = createDurationRecorder();
  const sqliteWrites = createDurationRecorder();

  // Session cookies stay in the main process; it answers per request.
  function requestCookieHeader(url: string) {
    const requestId = randomUUID();
    return new Promise<string>((resolve) => {
      cookieRequests.set(requestId, resolve);
      post({ type: "cookieHeaderRequest", requestId, url });
    });
  }

  function requireOwner() {
    if (!owner) throw new Error("mail engine is not started");
    return owner;
  }

  function health(): ChildHealth {
    return {
      eventLoopDelayMs: eventLoopDelay.drain(),
      sqliteReadMs: sqliteReads.drain(),
      sqliteWriteMs: sqliteWrites.drain(),
    };
  }

  async function run(message: MainToChildMessage): Promise<unknown> {
    switch (message.type) {
      case "start":
        owner = await createDesktopMailOwner({
          databasePath: message.databasePath,
          ...createRoutedBackendPorts(
            createOriginMailRequest({
              origin: message.origin,
              cookieHeader: requestCookieHeader,
            }),
          ),
          onEngineError: (error) => {
            if (isTransientNetworkError(error)) return;
            post(engineErrorMessage(error));
          },
          onSqliteTransaction: (kind, durationMs) =>
            (kind === "read" ? sqliteReads : sqliteWrites).record(durationMs),
        });
        return null;
      case "ipc":
        return requireOwner().handleIpc(message.payload);
      case "subscribe": {
        const { subscriptionId } = message;
        const unsubscribe = requireOwner().subscribe(
          message.payload,
          (snapshot) => post({ type: "snapshot", subscriptionId, snapshot }),
        );
        if (unsubscribe) subscriptions.set(subscriptionId, unsubscribe);
        return null;
      }
      case "unsubscribe":
        subscriptions.get(message.subscriptionId)?.();
        subscriptions.delete(message.subscriptionId);
        return null;
      case "recover":
        await requireOwner().recover();
        return null;
      case "close":
        for (const unsubscribe of subscriptions.values()) unsubscribe();
        subscriptions.clear();
        await owner?.close();
        owner = undefined;
        return null;
      case "health":
        return health();
      case "cookieHeader":
        cookieRequests.get(message.requestId)?.(message.cookieHeader);
        cookieRequests.delete(message.requestId);
        return null;
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  }

  return {
    async handle(message: MainToChildMessage) {
      const id = "id" in message ? message.id : null;
      try {
        const result = await run(message);
        if (id !== null) post({ type: "reply", id, status: "ok", result });
      } catch (error) {
        if (id === null) {
          post(engineErrorMessage(error));
          return;
        }
        post({
          type: "reply",
          id,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

function engineErrorMessage(error: unknown): ChildToMainMessage {
  return error instanceof Error
    ? { type: "engineError", message: error.message, stack: error.stack }
    : { type: "engineError", message: String(error) };
}
