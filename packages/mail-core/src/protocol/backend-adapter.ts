import { MAIL_PROTOCOL_VERSION } from "../identities";
import type { MailboxSource } from "../ports/mailbox-source";
import type { OperationExecutor } from "../ports/operation-executor";
import type { AssistantStateSource } from "../ports/assistant-source";
import {
  assistantStateResultSchema,
  bootstrapRequestSchema,
  bootstrapResultSchema,
  capabilitiesResultSchema,
  changesRequestSchema,
  changesResultSchema,
  conversationMembershipRequestSchema,
  conversationMembershipResultSchema,
  enumerationRequestSchema,
  enumerationResultSchema,
  hydrationRequestSchema,
  hydrationResultSchema,
  type MailHttpError,
  mailHttpErrorSchema,
  operationAdmitRequestSchema,
  operationAdmitResultSchema,
  operationInspectRequestSchema,
  scopesRequestSchema,
  scopesResultSchema,
  searchRequestSchema,
  searchResultSchema,
} from "./mail-http";

const UNSTRUCTURED_ERROR_RETRY_MS = 30_000;

export type MailHttpRequestFn = (input: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  signal: AbortSignal;
  accept?: "json" | "bytes";
}) => Promise<{
  status: number;
  json: unknown;
  bytes?: AsyncIterable<Uint8Array>;
  sizeBytes?: number | null;
}>;

export function createBackendMailboxSource(input: {
  request: MailHttpRequestFn;
  accountId: string;
}): MailboxSource {
  const { request, accountId } = input;
  const base = `/api/mail/v1/accounts/${encodeURIComponent(accountId)}`;
  return {
    async describe({ requestId, signal }) {
      const response = await request({
        method: "GET",
        path: `${base}/capabilities?requestId=${encodeURIComponent(requestId)}`,
        signal,
      });
      const error = readError(response);
      if (error) return mapReadError(error);
      const parsed = capabilitiesResultSchema.parse(response.json);
      return {
        status: "ok",
        value: {
          strategy: parsed.strategy,
          supportedChanges: parsed.supportedChanges,
          maxPageSize: parsed.maxPageSize,
          maxHydrationBatch: parsed.maxHydrationBatch,
        },
      };
    },
    async discoverScopes({ session, requestId, page, signal }) {
      const response = await request({
        method: "POST",
        path: `${base}/scopes`,
        body: scopesRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session,
          page,
        }),
        signal,
      });
      const error = readError(response);
      if (error) return mapReadError(error);
      const parsed = scopesResultSchema.parse(response.json);
      return {
        status: "ok",
        value: { scopes: parsed.scopes, nextPage: parsed.nextPage },
      };
    },
    async beginBootstrap({ session, requestId, scope, afterMs, signal }) {
      const response = await request({
        method: "POST",
        path: `${base}/bootstrap`,
        body: bootstrapRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session,
          scope,
          afterMs,
        }),
        signal,
      });
      const error = readError(response);
      if (error) return mapReadError(error);
      const parsed = bootstrapResultSchema.parse(response.json);
      return {
        status: "ok",
        value: {
          bootstrapId: parsed.bootstrapId,
          enumerationToken: parsed.enumerationToken,
          catchUpFrom: parsed.catchUpFrom,
        },
      };
    },
    async enumerate({
      session,
      requestId,
      bootstrapId,
      page,
      pageSize,
      signal,
    }) {
      const response = await request({
        method: "POST",
        path: `${base}/enumeration`,
        body: enumerationRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session,
          bootstrapId,
          page,
          pageSize,
        }),
        signal,
      });
      const reset = parseReset(response);
      if (reset) return reset;
      const error = readError(response);
      if (error) {
        if (error.error.code === "expired_position") {
          return { status: "reset_required", scopeId: "account" };
        }
        return mapReadError(error);
      }
      const parsed = enumerationResultSchema.parse(response.json);
      if (parsed.nextPage) {
        return {
          status: "ok",
          value: {
            bootstrapId: parsed.bootstrapId,
            scopeId: parsed.scopeId,
            changes: parsed.changes,
            requiredHydration: parsed.requiredHydration,
            bodies: parsed.bodies ?? [],
            nextPage: parsed.nextPage,
            catchUpFrom: null,
          },
        };
      }
      if (!parsed.catchUpFrom) {
        return { status: "paused", retryAfterMs: 1000, reason: "unavailable" };
      }
      return {
        status: "ok",
        value: {
          bootstrapId: parsed.bootstrapId,
          scopeId: parsed.scopeId,
          changes: parsed.changes,
          requiredHydration: parsed.requiredHydration,
          bodies: parsed.bodies ?? [],
          nextPage: null,
          catchUpFrom: parsed.catchUpFrom,
        },
      };
    },
    async readChanges({ session, requestId, position, pageSize, signal }) {
      const response = await request({
        method: "POST",
        path: `${base}/changes`,
        body: changesRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session,
          position,
          pageSize,
        }),
        signal,
      });
      const reset = parseReset(response);
      if (reset) return reset;
      const error = readError(response);
      if (error) {
        if (error.error.code === "expired_position") {
          return { status: "reset_required", scopeId: position.streamId };
        }
        return mapReadError(error);
      }
      return changesResultSchema.parse(response.json);
    },
    async hydrate({ session, requestId, keys, purpose, signal }) {
      const response = await request({
        method: "POST",
        path: `${base}/hydration`,
        body: hydrationRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session,
          keys,
          purpose,
        }),
        signal,
      });
      const error = readError(response);
      if (error) return mapReadError(error);
      const parsed = hydrationResultSchema.parse(response.json);
      return {
        status: "ok",
        value: {
          changes: parsed.changes,
          bodies: parsed.bodies,
          unresolved: parsed.unresolved,
        },
      };
    },
    async readConversationMembership({
      session,
      requestId,
      conversation,
      resolutionId,
      page,
      pageSize,
      signal,
    }) {
      const response = await request({
        method: "POST",
        path: `${base}/conversation-membership`,
        body: conversationMembershipRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session,
          conversation,
          resolutionId,
          page,
          pageSize,
        }),
        signal,
      });
      const error = readError(response);
      if (error) return mapReadError(error);
      return {
        status: "ok",
        value: conversationMembershipResultSchema.parse(response.json),
      };
    },
    async search({ session, requestId, predicate, page, pageSize, signal }) {
      const response = await request({
        method: "POST",
        path: `${base}/search`,
        body: searchRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session,
          predicate,
          page,
          pageSize,
        }),
        signal,
      });
      if (response.status === 422) return { status: "unsupported" };
      const error = readError(response);
      if (error) {
        if (error.error.code === "unsupported")
          return { status: "unsupported" };
        return mapReadError(error);
      }
      const parsed = searchResultSchema.parse(response.json);
      return {
        status: "ok",
        value: {
          matches: parsed.matches,
          nextPage: parsed.nextPage,
          semantics: parsed.semantics,
        },
      };
    },
    async readAttachment({ requestId, key, attachmentId, signal }) {
      if (key.accountId !== accountId) {
        return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
      }
      const params = new URLSearchParams({
        messageId: key.messageId,
        attachmentId,
        requestId,
        protocolVersion: String(MAIL_PROTOCOL_VERSION),
      });
      const response = await request({
        method: "GET",
        path: `${base}/attachment-content?${params}`,
        signal,
        accept: "bytes",
      });
      const error = readError(response);
      if (error?.error.code === "not_found" || response.status === 404) {
        return { status: "not_found" };
      }
      if (error) {
        return mapReadError(error);
      }
      if (response.status >= 400 || !response.bytes) {
        return { status: "paused", retryAfterMs: 1000, reason: "unavailable" };
      }
      return {
        status: "ok",
        value: {
          bytes: response.bytes,
          sizeBytes: response.sizeBytes ?? null,
        },
      };
    },
  };
}

export function createBackendOperationExecutor(input: {
  request: MailHttpRequestFn;
  accountId: string;
}): OperationExecutor {
  const { request, accountId } = input;
  const base = `/api/mail/v1/accounts/${encodeURIComponent(accountId)}`;
  return {
    async execute({ operation, attemptId, signal }) {
      const requestId = attemptId;
      const response = await request({
        method: "PUT",
        path: `${base}/operations/${encodeURIComponent(operation.key.operationId)}`,
        body: operationAdmitRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session: operation.session,
          operation,
          attemptId,
        }),
        signal,
      });
      const error = parseError(response);
      if (error) return mapExecutionError(error);
      return operationAdmitResultSchema.parse(response.json);
    },
    async inspect({ operation, receiptId, signal }) {
      const requestId = `inspect-${operation.key.operationId}`;
      const response = await request({
        method: "POST",
        path: `${base}/operations/${encodeURIComponent(operation.key.operationId)}`,
        body: operationInspectRequestSchema.parse({
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          session: operation.session,
          operation,
          receiptId,
        }),
        signal,
      });
      const error = parseError(response);
      if (error) return mapExecutionError(error);
      return operationAdmitResultSchema.parse(response.json);
    },
    async stageUpload({
      session,
      uploadId,
      checksum,
      sizeBytes,
      filename,
      contentType,
      bytes,
      signal,
    }) {
      const admit = await request({
        method: "POST",
        path: `${base}/uploads`,
        body: {
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId: uploadId,
          session,
          uploadId,
          checksum,
          sizeBytes,
          filename,
          contentType,
        },
        signal,
      });
      if (admit.status >= 400) {
        const error = parseError(admit);
        if (error?.error.code === "too_large") {
          return { status: "rejected", code: "too_large" };
        }
        return { status: "unavailable" };
      }
      const collected = await collectBytes(bytes);
      const put = await request({
        method: "PUT",
        path: `${base}/uploads/${encodeURIComponent(uploadId)}/content?protocolVersion=${MAIL_PROTOCOL_VERSION}`,
        body: collected,
        signal,
      });
      if (put.status >= 400) {
        return { status: "unavailable" };
      }
      const hold = await request({
        method: "POST",
        path: `${base}/uploads/${encodeURIComponent(uploadId)}?protocolVersion=${MAIL_PROTOCOL_VERSION}`,
        body: {
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId: `${uploadId}-hold`,
          session,
          held: true,
        },
        signal,
      });
      if (hold.status >= 400) return { status: "unavailable" };
      return { status: "staged", blobId: uploadId };
    },
  };
}

export function createBackendAssistantSource(input: {
  request: MailHttpRequestFn;
  accountId: string;
}): AssistantStateSource {
  const { request, accountId } = input;
  const base = `/api/mail/v1/accounts/${encodeURIComponent(accountId)}`;
  return {
    async read({ session, cursor, signal }) {
      const requestId = `assistant-${session.generation}`;
      const response = await request({
        method: "GET",
        path: `${base}/assistant-state?cursor=${encodeURIComponent(cursor ?? "")}&requestId=${encodeURIComponent(requestId)}`,
        signal,
      });
      const error = readError(response);
      if (error) {
        if (error.error.code === "blocked_auth")
          return { status: "blocked_auth" };
        return {
          status: "paused",
          retryAfterMs: error.error.retryAfterMs ?? 1000,
        };
      }
      const parsed = assistantStateResultSchema.parse(response.json);
      return {
        status: "ok",
        page: {
          session,
          cursor: parsed.cursor,
          nextCursor: parsed.nextCursor,
          reset: parsed.reset,
          entries: parsed.entries,
        },
      };
    },
  };
}

function parseError(response: { status: number; json: unknown }) {
  if (response.status < 400) return null;
  const parsed = mailHttpErrorSchema.safeParse(response.json);
  return parsed.success ? parsed.data : null;
}

// Auth middleware, the hosting platform, and proxies answer without the mail
// error envelope. Their bodies are not results, so classify them by status.
function readError(response: {
  status: number;
  json: unknown;
}): Pick<MailHttpError, "error"> | null {
  if (response.status < 400) return null;
  const structured = parseError(response);
  if (structured) return structured;
  if (response.status === 401) {
    return { error: { code: "blocked_auth", retryable: true } };
  }
  return {
    error: {
      code: response.status === 429 ? "throttled" : "unavailable",
      retryable: true,
      retryAfterMs: UNSTRUCTURED_ERROR_RETRY_MS,
    },
  };
}

function parseReset(response: { status: number; json: unknown }) {
  if (
    response.json &&
    typeof response.json === "object" &&
    "status" in response.json &&
    response.json.status === "reset_required"
  ) {
    const scopeId =
      "scopeId" in response.json && typeof response.json.scopeId === "string"
        ? response.json.scopeId
        : "account";
    return { status: "reset_required" as const, scopeId };
  }
  return null;
}

function mapReadError(error: Pick<MailHttpError, "error">) {
  if (error.error.code === "blocked_auth")
    return { status: "blocked_auth" as const };
  if (error.error.code === "throttled" || error.error.code === "unavailable") {
    return {
      status: "paused" as const,
      retryAfterMs: error.error.retryAfterMs ?? 1000,
      reason:
        error.error.code === "throttled"
          ? ("throttled" as const)
          : ("unavailable" as const),
    };
  }
  return {
    status: "paused" as const,
    retryAfterMs: error.error.retryAfterMs ?? 1000,
    reason: "unavailable" as const,
  };
}

function mapExecutionError(error: NonNullable<ReturnType<typeof parseError>>) {
  if (!error) return { status: "uncertain" as const, receiptId: null };
  if (error.error.code === "blocked_auth") {
    return {
      status: "not_dispatched" as const,
      reason: "blocked_auth" as const,
      retryAfterMs: error.error.retryAfterMs ?? null,
    };
  }
  if (error.error.code === "throttled") {
    return {
      status: "not_dispatched" as const,
      reason: "throttled" as const,
      retryAfterMs: error.error.retryAfterMs ?? 1000,
    };
  }
  if (error.error.code === "unavailable") {
    return {
      status: "not_dispatched" as const,
      reason: "unavailable" as const,
      retryAfterMs: error.error.retryAfterMs ?? 1000,
    };
  }
  return { status: "uncertain" as const, receiptId: null };
}

async function collectBytes(bytes: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of bytes) {
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  const collected = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    collected.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return collected;
}
