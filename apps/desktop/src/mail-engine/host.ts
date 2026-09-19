import {
  createMailEngine,
  createHostRuntime,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import type { AssistantStateSource } from "@inboxzero/mail-core/ports/assistant-source";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import { createDesktopMailStore } from "./sqlite";
import { desktopStoragePressure } from "./storage-pressure";

export async function createDesktopMailEngine(input: {
  databasePath: string;
  source: MailboxSource;
  executor: OperationExecutor;
  assistant?: AssistantStateSource;
}): Promise<MailEngine> {
  const store = await createDesktopMailStore(input.databasePath);
  return createMailEngine({
    store,
    source: input.source,
    executor: input.executor,
    assistant: input.assistant,
    runtime: createHostRuntime({
      storagePressure: () => desktopStoragePressure(input.databasePath),
    }),
    ownerId: "desktop-owner",
  });
}
