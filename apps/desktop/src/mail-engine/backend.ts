import {
  createBackendMailboxSource,
  createBackendOperationExecutor,
  type MailHttpRequestFn,
} from "@inboxzero/mail-core/protocol/backend-adapter";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";

export function createRoutedBackendPorts(request: MailHttpRequestFn): {
  source: MailboxSource;
  executor: OperationExecutor;
} {
  const sources = new Map<string, MailboxSource>();
  const executors = new Map<string, OperationExecutor>();
  const sourceFor = (accountId: string) => {
    const existing = sources.get(accountId);
    if (existing) return existing;
    const created = createBackendMailboxSource({ request, accountId });
    sources.set(accountId, created);
    return created;
  };
  const executorFor = (accountId: string) => {
    const existing = executors.get(accountId);
    if (existing) return existing;
    const created = createBackendOperationExecutor({ request, accountId });
    executors.set(accountId, created);
    return created;
  };
  return {
    source: {
      describe: (input) => sourceFor(input.session.accountId).describe(input),
      discoverScopes: (input) =>
        sourceFor(input.session.accountId).discoverScopes(input),
      beginBootstrap: (input) =>
        sourceFor(input.session.accountId).beginBootstrap(input),
      enumerate: (input) => sourceFor(input.session.accountId).enumerate(input),
      readChanges: (input) =>
        sourceFor(input.session.accountId).readChanges(input),
      hydrate: (input) => sourceFor(input.session.accountId).hydrate(input),
      readConversationMembership: (input) =>
        sourceFor(input.session.accountId).readConversationMembership(input),
      search: (input) => sourceFor(input.session.accountId).search(input),
      readAttachment: (input) =>
        sourceFor(input.session.accountId).readAttachment(input),
    },
    executor: {
      execute: (input) =>
        executorFor(input.operation.key.accountId).execute(input),
      inspect: (input) =>
        executorFor(input.operation.key.accountId).inspect(input),
    },
  };
}
