import { z } from "zod";
import {
  accountSessionSchema,
  conversationKeySchema,
  MAIL_PROTOCOL_VERSION,
  messageKeySchema,
} from "../identities";
import { mailPredicateSchema } from "../queries";
import {
  bodyObservationSchema,
  conversationMembershipPageSchema,
  providerChangeSchema,
  syncPageSchema,
  syncPositionSchema,
} from "../sync";
import { preparedOperationSchema, targetOutcomeSchema } from "../operations";

export const mailProtocolVersionSchema = z.literal(MAIL_PROTOCOL_VERSION);

export const mailHttpErrorCodeSchema = z.enum([
  "invalid",
  "unauthorized",
  "forbidden",
  "unsupported_version",
  "unsupported",
  "throttled",
  "unavailable",
  "expired_position",
  "blocked_auth",
  "not_found",
]);

export const mailHttpErrorSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  error: z.object({
    code: mailHttpErrorCodeSchema,
    retryable: z.boolean(),
    retryAfterMs: z.number().int().nullable().optional(),
  }),
});
export type MailHttpError = z.infer<typeof mailHttpErrorSchema>;

export const capabilitiesResultSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  strategy: z.enum(["account_history", "folder_delta"]),
  supportedChanges: z.array(
    z.enum([
      "archive",
      "unarchive",
      "set_read",
      "set_starred",
      "trash",
      "restore_from_trash",
      "set_spam",
      "move",
      "set_membership",
    ]),
  ),
  maxPageSize: z.number().int(),
  maxHydrationBatch: z.number().int(),
});
export type CapabilitiesResult = z.infer<typeof capabilitiesResultSchema>;

export const scopesRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  page: z.string().max(16_384).nullable(),
});

export const scopesResultSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  scopes: z.array(
    z.object({
      id: z.string().min(1).max(256),
      kind: z.enum(["account", "folder"]),
      folderId: z.string().max(256).nullable(),
    }),
  ),
  nextPage: z.string().max(16_384).nullable(),
});

export const bootstrapRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  scope: z.object({
    id: z.string().min(1).max(256),
    kind: z.enum(["account", "folder"]),
    folderId: z.string().max(256).nullable(),
  }),
  afterMs: z.number().int().nullable(),
});

export const bootstrapResultSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  bootstrapId: z.string().min(1).max(256),
  enumerationToken: z.string().max(16_384),
  catchUpFrom: syncPositionSchema.nullable(),
});

export const enumerationRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  bootstrapId: z.string().min(1).max(256),
  page: z.string().max(16_384),
  pageSize: z.number().int().min(1).max(100),
});

export const enumerationResultSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  bootstrapId: z.string(),
  scopeId: z.string(),
  changes: z.array(providerChangeSchema),
  requiredHydration: z.array(messageKeySchema),
  nextPage: z.string().max(16_384).nullable(),
  catchUpFrom: syncPositionSchema.nullable(),
});

export const changesRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  position: syncPositionSchema,
  pageSize: z.number().int().min(1).max(100),
});

export const changesResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("page"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    page: syncPageSchema,
  }),
  z.object({
    status: z.literal("reset_required"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    scopeId: z.string(),
  }),
  z.object({
    status: z.literal("paused"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    retryAfterMs: z.number().int(),
    reason: z.enum(["throttled", "unavailable"]),
  }),
  z.object({
    status: z.literal("blocked_auth"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
  }),
]);

export const hydrationRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  keys: z.array(messageKeySchema).min(1).max(50),
  purpose: z.enum(["metadata", "body"]),
});

export const hydrationResultSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  changes: z.array(providerChangeSchema),
  bodies: z.array(bodyObservationSchema),
  unresolved: z.array(
    z.object({
      key: messageKeySchema,
      reason: z.enum(["not_found", "unavailable"]),
    }),
  ),
});

export const conversationMembershipRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  conversation: conversationKeySchema,
  resolutionId: z.string().min(1).max(128),
  page: z.string().max(16_384).nullable(),
  pageSize: z.number().int().min(1).max(100),
});

export const conversationMembershipResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("page"),
      protocolVersion: mailProtocolVersionSchema,
      requestId: z.string(),
      page: conversationMembershipPageSchema,
    }),
    z.object({
      status: z.literal("not_found"),
      protocolVersion: mailProtocolVersionSchema,
      requestId: z.string(),
    }),
    z.object({
      status: z.literal("restart_required"),
      protocolVersion: mailProtocolVersionSchema,
      requestId: z.string(),
    }),
    z.object({
      status: z.literal("unsupported"),
      protocolVersion: mailProtocolVersionSchema,
      requestId: z.string(),
    }),
  ],
);

export const searchRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  predicate: mailPredicateSchema,
  page: z.string().max(16_384).nullable(),
  pageSize: z.number().int().min(1).max(50),
});

export const searchResultSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string(),
  matches: z.array(messageKeySchema),
  nextPage: z.string().nullable(),
  semantics: z.enum(["exact", "candidates_require_local_filter"]),
});

export const operationAdmitRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  operation: preparedOperationSchema,
  attemptId: z.string().min(1).max(128),
});

export const operationAdmitResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("confirmed"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    receiptId: z.string().nullable(),
    observations: z.array(providerChangeSchema),
    targets: z.array(targetOutcomeSchema),
  }),
  z.object({
    status: z.literal("accepted"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    receiptId: z.string(),
    retryAfterMs: z.number().int(),
  }),
  z.object({
    status: z.literal("not_dispatched"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    reason: z.enum(["throttled", "blocked_auth", "unavailable"]),
    retryAfterMs: z.number().int().nullable(),
  }),
  z.object({
    status: z.literal("rejected"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    code: z.string(),
    targets: z.array(targetOutcomeSchema),
  }),
  z.object({
    status: z.literal("uncertain"),
    protocolVersion: mailProtocolVersionSchema,
    requestId: z.string(),
    receiptId: z.string().nullable(),
  }),
]);

export const operationInspectRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  operation: preparedOperationSchema,
  receiptId: z.string().max(256).nullable(),
});

export const assistantStateRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  cursor: z.string().max(16_384).nullable(),
});

export const assistantStateResultSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string(),
  cursor: z.string().nullable(),
  nextCursor: z.string().nullable(),
  reset: z.boolean(),
  entries: z.array(
    z.object({
      id: z.string(),
      revision: z.string(),
      messageId: z.string().nullable(),
      conversationId: z.string().nullable(),
      kind: z.string(),
      payload: z.unknown(),
    }),
  ),
});

export const uploadAdmitRequestSchema = z.object({
  protocolVersion: mailProtocolVersionSchema,
  requestId: z.string().min(1).max(128),
  session: accountSessionSchema,
  uploadId: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative().max(25_000_000),
  checksum: z.string().min(1).max(128),
  contentType: z.string().max(256),
});

export function mailHttpErrorResponse(input: {
  requestId: string;
  code: z.infer<typeof mailHttpErrorCodeSchema>;
  retryable: boolean;
  retryAfterMs?: number | null;
}): MailHttpError {
  return {
    protocolVersion: MAIL_PROTOCOL_VERSION,
    requestId: input.requestId,
    error: {
      code: input.code,
      retryable: input.retryable,
      retryAfterMs: input.retryAfterMs ?? null,
    },
  };
}

export { MAIL_PROTOCOL_VERSION };
