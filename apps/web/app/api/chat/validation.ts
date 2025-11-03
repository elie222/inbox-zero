import { z } from "zod";

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

export const messageContextSchema = z.object({
  type: z.literal("fix-rule"),
  message: parsedMessageSchema,
  results: z.array(
    z.object({ ruleName: z.string().nullable(), reason: z.string() }),
  ),
  expected: z.union([
    z.literal("new"),
    z.literal("none"),
    z.object({ name: z.string() }),
  ]),
});
export type MessageContext = z.infer<typeof messageContextSchema>;
