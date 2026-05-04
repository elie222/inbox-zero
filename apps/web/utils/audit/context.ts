import { AsyncLocalStorage } from "node:async_hooks";

export type AuditActorType =
  | "anonymous"
  | "user"
  | "email_account"
  | "api_key"
  | "admin"
  | "system";

export type AuditContext = {
  requestId?: string;
  source?: string;
  userId?: string;
  emailAccountId?: string;
  apiKeyId?: string;
  actorType?: AuditActorType;
};

const auditContextStorage = new AsyncLocalStorage<AuditContext>();

export function getAuditContext(): AuditContext {
  return auditContextStorage.getStore() ?? {};
}

export function runWithAuditContext<T>(
  context: AuditContext,
  callback: () => T,
): T {
  const mergedContext = mergeAuditContext(getAuditContext(), context);
  return auditContextStorage.run(mergedContext, callback);
}

export function setAuditContext(context: AuditContext) {
  const store = auditContextStorage.getStore();
  if (!store) return;

  Object.assign(store, normalizeAuditContext(context));
}

export const __testing__ = {
  mergeAuditContext,
};

function mergeAuditContext(
  current: AuditContext,
  next: AuditContext,
): AuditContext {
  return {
    ...current,
    ...normalizeAuditContext(next),
  };
}

function normalizeAuditContext(context: AuditContext): AuditContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  ) as AuditContext;
}
