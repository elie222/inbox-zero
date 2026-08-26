import { z } from "zod";
import { durableEmailSendBody } from "@/utils/email/durable-email-send.validation";

const snapshot = z.object({
  mutationId: z.string().uuid(),
  threadId: z.string().min(1).max(512),
  messageIds: z.array(z.string().min(1).max(512)).min(1).max(1000),
});

export const executeMailMutationBody = z.discriminatedUnion("kind", [
  snapshot.extend({
    kind: z.literal("archive"),
    labelId: z.string().min(1).max(512).optional(),
  }),
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
  durableEmailSendBody.extend({
    kind: z.literal("reply"),
  }),
]);

export type ExecuteMailMutationBody = z.infer<typeof executeMailMutationBody>;
