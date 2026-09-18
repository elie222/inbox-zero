import { z } from "zod";
import { accountSessionSchema, messageKeySchema } from "./identities";
import { messageMetadataPatchSchema } from "./messages";
import { providerReferenceSchema } from "./identities";

export const syncPositionSchema = z.object({
  streamId: z.string().min(1).max(256),
  generation: z.string().min(1).max(128),
  checkpoint: z.string().max(16_384).nullable(),
});
export type SyncPosition = z.infer<typeof syncPositionSchema>;

export const providerChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("message_patch"),
    key: messageKeySchema,
    reference: providerReferenceSchema,
    fields: messageMetadataPatchSchema,
  }),
  z.object({
    kind: z.literal("removed_from_scope"),
    key: messageKeySchema,
    scopeId: z.string().min(1).max(256),
  }),
  z.object({
    kind: z.literal("message_deleted"),
    key: messageKeySchema,
    evidence: z.string().max(1024),
  }),
  z.object({
    kind: z.literal("container_upsert"),
    id: z.string().min(1).max(256),
    container: z.enum(["folder", "label", "category"]),
    name: z.string().max(1024),
    parentId: z.string().max(256).nullable(),
  }),
  z.object({
    kind: z.literal("container_removed"),
    id: z.string().min(1).max(256),
    container: z.enum(["folder", "label", "category"]),
  }),
]);
export type ProviderChange = z.infer<typeof providerChangeSchema>;

export const syncPageSchema = z.object({
  session: accountSessionSchema,
  requestId: z.string().min(1).max(128),
  from: syncPositionSchema,
  to: syncPositionSchema,
  changes: z.array(providerChangeSchema).max(1000),
  requiredHydration: z.array(messageKeySchema).max(1000),
  roundComplete: z.boolean(),
});
export type SyncPage = z.infer<typeof syncPageSchema>;

export const bodyObservationSchema = z.object({
  key: messageKeySchema,
  version: z.string().max(512).nullable(),
  html: z.string().max(5_000_000).nullable(),
  text: z.string().max(5_000_000).nullable(),
});
export type BodyObservation = z.infer<typeof bodyObservationSchema>;

export const conversationMembershipPageSchema = z.object({
  conversation: z.object({
    accountId: z.string().min(1),
    conversationId: z.string().min(1),
  }),
  resolutionId: z.string().min(1).max(128),
  keys: z.array(messageKeySchema).max(500),
  changes: z.array(providerChangeSchema).max(500),
  nextPage: z.string().max(16_384).nullable(),
  evidence: z.string().max(1024).nullable(),
});
export type ConversationMembershipPage = z.infer<
  typeof conversationMembershipPageSchema
>;
