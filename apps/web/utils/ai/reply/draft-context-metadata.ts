import { z } from "zod";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";

export const draftContextMetadataSchema = z.object({
  replyMemories: z.object({
    count: z.number(),
    ids: z.array(z.string()),
    kinds: z.array(z.nativeEnum(ReplyMemoryKind)),
    scopeTypes: z.array(z.nativeEnum(ReplyMemoryScopeType)),
  }),
  knowledgeBase: z.object({
    availableCount: z.number(),
    injected: z.boolean(),
  }),
  senderHistory: z.object({
    summaryInjected: z.boolean(),
    summarySourceMessageCount: z.number(),
    precedentThreadsInjected: z.boolean(),
    precedentThreadCount: z.number(),
    sameSenderReplyExamplesInjected: z.boolean(),
    sameSenderReplyExampleCount: z.number(),
  }),
  calendar: z.object({
    injected: z.boolean(),
    noAvailability: z.boolean(),
    suggestedTimesCount: z.number(),
  }),
  writingStyle: z.object({
    custom: z.boolean(),
  }),
  externalTools: z.object({
    injected: z.boolean(),
  }),
  meetings: z.object({
    injected: z.boolean(),
    count: z.number(),
  }),
  attachments: z.object({
    injected: z.boolean(),
    selectedCount: z.number(),
  }),
});

export type DraftContextMetadata = z.infer<typeof draftContextMetadataSchema>;
