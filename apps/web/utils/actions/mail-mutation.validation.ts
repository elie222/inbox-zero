import { z } from "zod";
import { sendEmailBody } from "@/utils/gmail/mail";

const snapshot = z.object({
  mutationId: z.string().uuid(),
  threadId: z.string().min(1).max(512),
  messageIds: z.array(z.string().min(1).max(512)).min(1).max(1000),
});

export const executeMailMutationBody = z.discriminatedUnion("kind", [
  snapshot.extend({ kind: z.literal("archive") }),
  snapshot.extend({ kind: z.literal("unarchive") }),
  snapshot.extend({ kind: z.literal("trash") }),
  snapshot.extend({ kind: z.literal("untrash") }),
  snapshot.extend({ kind: z.literal("set_read_state"), read: z.boolean() }),
  snapshot.extend({
    kind: z.literal("snooze"),
    scheduledFor: z.string().datetime(),
  }),
  snapshot.extend({
    kind: z.literal("cancel_snooze"),
    snoozeMutationId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("reply"),
    mutationId: z.string().uuid(),
    threadId: z.string().min(1).max(512),
    messageIds: z.array(z.string().min(1).max(512)).max(1000),
    email: sendEmailBody,
  }),
]);

export type ExecuteMailMutationBody = z.infer<typeof executeMailMutationBody>;
