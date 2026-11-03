import { z } from "zod";
import { sliceHead } from "@/utils/string";
import { GroupItemType, SystemType } from "@/generated/prisma/enums";

const parsedMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  snippet: z.string(),
  textPlain: z.string().optional(),
  textHtml: z.string().optional(),
  headers: z.object({
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    cc: z.string().optional(),
    date: z.string(),
    "reply-to": z.string().optional(),
  }),
  internalDate: z.string().optional().nullable(),
});

const serializedMatchReasonSchema = z.union([
  z.object({
    type: z.literal("STATIC"),
  }),
  z.object({
    type: z.literal("LEARNED_PATTERN"),
    group: z.object({
      id: z.string(),
      name: z.string(),
    }),
    groupItem: z.object({
      id: z.string(),
      type: z.nativeEnum(GroupItemType),
      value: z.string(),
      exclude: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("AI"),
  }),
  z.object({
    type: z.literal("PRESET"),
    systemType: z.nativeEnum(SystemType),
  }),
]);

export const serializedMatchMetadataSchema = z
  .array(serializedMatchReasonSchema)
  .nullish();

const fixRuleContextSchema = z.object({
  type: z.literal("fix-rule"),
  message: parsedMessageSchema,
  results: z.array(
    z.object({
      ruleName: z.string().nullable(),
      systemType: z.nativeEnum(SystemType).nullable().optional(),
      reason: z.string(),
      matchMetadata: serializedMatchMetadataSchema,
    }),
  ),
  expected: z.union([
    z.literal("new"),
    z.literal("none"),
    z.union([
      z.object({
        id: z.string(),
        name: z.string(),
      }),
      z.object({
        name: z.string(),
      }),
    ]),
  ]),
});
export const emailMessageContextSchema = z.object({
  type: z.literal("email"),
  message: parsedMessageSchema.extend({
    id: boundedString(1000),
    threadId: boundedString(1000),
    snippet: boundedString(3000),
    textPlain: boundedString(12_000).optional(),
    textHtml: boundedString(12_000).optional(),
    headers: z.object({
      from: boundedString(1000),
      to: boundedString(1000),
      subject: boundedString(1000),
      cc: boundedString(1000).optional(),
      date: boundedString(100),
      "reply-to": boundedString(1000).optional(),
    }),
    internalDate: boundedString(100).nullish(),
  }),
});

export const messageContextSchema = z.discriminatedUnion("type", [
  fixRuleContextSchema,
  emailMessageContextSchema,
]);
export type MessageContext = z.infer<typeof messageContextSchema>;

function boundedString(maxLength: number) {
  return z.string().transform((value) => sliceHead(value, maxLength));
}
