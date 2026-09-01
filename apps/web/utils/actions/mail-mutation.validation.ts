import { z } from "zod";
import {
  BULK_ARCHIVE_MESSAGES_ACTION_LIMIT,
  BULK_ARCHIVE_THREADS_ACTION_LIMIT,
} from "@/utils/actions/mail-bulk-action.constants";
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

export const executeArchiveMutationBatchBody = z
  .object({
    mutations: z
      .array(snapshot.pick({ messageIds: true }))
      .min(1)
      .max(BULK_ARCHIVE_THREADS_ACTION_LIMIT),
  })
  .superRefine(({ mutations }, context) => {
    const messageCount = new Set(
      mutations.flatMap((mutation) => mutation.messageIds),
    ).size;
    if (messageCount > BULK_ARCHIVE_MESSAGES_ACTION_LIMIT) {
      context.addIssue({
        code: "custom",
        message: "Archive batch contains too many messages",
        path: ["mutations"],
      });
    }
  });

export type ExecuteMailMutationBody = z.infer<typeof executeMailMutationBody>;
