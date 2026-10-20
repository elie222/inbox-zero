import { z } from "zod";

export const MOVE_THREADS_ACTION_LIMIT = 100;

const threadIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(MOVE_THREADS_ACTION_LIMIT);

export const moveThreadsToJunkBody = z.object({ threadIds: threadIdsSchema });

export const restoreThreadsToInboxBody = z.object({
  threadIds: threadIdsSchema,
  from: z.enum(["junk", "archive"]),
});
