import {
  createMailEngine,
  createHostRuntime,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import { dispatchMailIpc } from "./ipc";
import { createDesktopMailStore } from "./sqlite";

export type DesktopMailOwner = {
  handleIpc(payload: unknown): Promise<unknown>;
  recover(): Promise<void>;
  close(): Promise<void>;
};

export async function createDesktopMailOwner(input: {
  databasePath: string;
  source: MailboxSource;
  executor: OperationExecutor;
}): Promise<DesktopMailOwner> {
  let engine = await createOwnedEngine(input);
  return {
    handleIpc(payload) {
      return dispatchMailIpc(engine, payload);
    },
    async recover() {
      await engine.close();
      engine = await createOwnedEngine(input);
    },
    close() {
      return engine.close();
    },
  };
}

async function createOwnedEngine(input: {
  databasePath: string;
  source: MailboxSource;
  executor: OperationExecutor;
}): Promise<MailEngine> {
  const store = await createDesktopMailStore(input.databasePath);
  return createMailEngine({
    store,
    source: input.source,
    executor: input.executor,
    runtime: createHostRuntime(),
    ownerId: "desktop-owner",
  });
}
