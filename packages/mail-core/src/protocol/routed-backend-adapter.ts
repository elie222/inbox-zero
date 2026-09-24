import type { AssistantStateSource } from "../ports/assistant-source";
import type { MailboxSource } from "../ports/mailbox-source";
import type { OperationExecutor } from "../ports/operation-executor";
import {
  createBackendAssistantSource,
  createBackendMailboxSource,
  createBackendOperationExecutor,
  type MailHttpRequestFn,
} from "./backend-adapter";

export function createRoutedBackendAdapter(input: {
  requestFor: (accountId: string) => MailHttpRequestFn;
}): {
  source: MailboxSource;
  executor: OperationExecutor;
  assistant: AssistantStateSource;
} {
  const sources = new Map<string, MailboxSource>();
  const executors = new Map<string, OperationExecutor>();
  const assistants = new Map<string, AssistantStateSource>();
  const sourceFor = (accountId: string) => {
    const existing = sources.get(accountId);
    if (existing) return existing;
    const created = createBackendMailboxSource({
      request: input.requestFor(accountId),
      accountId,
    });
    sources.set(accountId, created);
    return created;
  };
  const executorFor = (accountId: string) => {
    const existing = executors.get(accountId);
    if (existing) return existing;
    const created = createBackendOperationExecutor({
      request: input.requestFor(accountId),
      accountId,
    });
    executors.set(accountId, created);
    return created;
  };
  const assistantFor = (accountId: string) => {
    const existing = assistants.get(accountId);
    if (existing) return existing;
    const created = createBackendAssistantSource({
      request: input.requestFor(accountId),
      accountId,
    });
    assistants.set(accountId, created);
    return created;
  };
  return {
    source: {
      describe: (request) =>
        sourceFor(request.session.accountId).describe(request),
      discoverScopes: (request) =>
        sourceFor(request.session.accountId).discoverScopes(request),
      beginBootstrap: (request) =>
        sourceFor(request.session.accountId).beginBootstrap(request),
      enumerate: (request) =>
        sourceFor(request.session.accountId).enumerate(request),
      readChanges: (request) =>
        sourceFor(request.session.accountId).readChanges(request),
      hydrate: (request) =>
        sourceFor(request.session.accountId).hydrate(request),
      readConversationMembership: (request) =>
        sourceFor(request.session.accountId).readConversationMembership(
          request,
        ),
      search: (request) => sourceFor(request.session.accountId).search(request),
      readAttachment: (request) =>
        sourceFor(request.key.accountId).readAttachment(request),
    },
    executor: {
      execute: (request) =>
        executorFor(request.operation.key.accountId).execute(request),
      inspect: (request) =>
        executorFor(request.operation.key.accountId).inspect(request),
      stageUpload: (request) => {
        const executor = executorFor(request.session.accountId);
        if (!executor.stageUpload) {
          return Promise.resolve({ status: "unavailable" as const });
        }
        return executor.stageUpload(request);
      },
    },
    assistant: {
      read: (request) => assistantFor(request.session.accountId).read(request),
    },
  };
}

export type { MailHttpRequestFn } from "./backend-adapter";
