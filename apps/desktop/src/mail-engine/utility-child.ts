import { createDesktopMailOwner, type DesktopMailOwner } from "./owner";
import { createRoutedBackendPorts } from "./backend";
import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";

export type UtilityChildMessage =
  | { id: string; type: "start"; databasePath: string; origin: string }
  | { id: string; type: "ipc"; payload: unknown }
  | { id: string; type: "recover" }
  | { id: string; type: "close" };

export type UtilityChildReply = {
  id: string;
  status: "ok" | "error";
  result: unknown;
};

export function createUtilityChildRuntime() {
  let owner: DesktopMailOwner | undefined;
  return {
    async handle(message: UtilityChildMessage): Promise<UtilityChildReply> {
      try {
        if (message.type === "start") {
          owner = await createDesktopMailOwner({
            databasePath: message.databasePath,
            ...createRoutedBackendPorts(createOriginRequest(message.origin)),
          });
          return { id: message.id, status: "ok", result: { started: true } };
        }
        if (!owner) {
          return {
            id: message.id,
            status: "error",
            result: { message: "owner not started" },
          };
        }
        if (message.type === "ipc") {
          return {
            id: message.id,
            status: "ok",
            result: await owner.handleIpc(message.payload),
          };
        }
        if (message.type === "recover") {
          await owner.recover();
          return { id: message.id, status: "ok", result: { recovered: true } };
        }
        await owner.close();
        owner = undefined;
        return { id: message.id, status: "ok", result: { closed: true } };
      } catch (error) {
        return {
          id: message.id,
          status: "error",
          result: {
            message: error instanceof Error ? error.message : "child_error",
          },
        };
      }
    },
  };
}

function createOriginRequest(origin: string): MailHttpRequestFn {
  return async ({ method, path, body, signal }) => {
    const response = await fetch(new URL(path, origin), {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };
}

export function bindUtilityChildTransport(
  childRuntime: ReturnType<typeof createUtilityChildRuntime>,
  processLike: {
    send?: (message: unknown) => boolean;
    on?(event: "message", listener: (message: unknown) => void): unknown;
    parentPort?: {
      on(
        event: "message",
        listener: (event: { data: unknown } | unknown) => void,
      ): unknown;
      postMessage(message: unknown): void;
    };
  },
) {
  if (typeof processLike.send === "function" && processLike.on) {
    processLike.on("message", (message) => {
      childRuntime
        .handle(message as UtilityChildMessage)
        .then((reply) => processLike.send?.(reply));
    });
    return;
  }
  if (!processLike.parentPort) return;
  processLike.parentPort.on("message", (event) => {
    const message =
      event && typeof event === "object" && "data" in event
        ? event.data
        : event;
    childRuntime
      .handle(message as UtilityChildMessage)
      .then((reply) => processLike.parentPort?.postMessage(reply));
  });
}

const runtime = createUtilityChildRuntime();
bindUtilityChildTransport(runtime, process);
