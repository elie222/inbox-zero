import { z } from "zod";

const timestamp = z
  .number()
  .int()
  .min(-8_640_000_000_000_000)
  .max(8_640_000_000_000_000);
const cursor = z.string().min(1).max(32_768);
const id = z.string().min(1).max(2048);
const limit = z.number().int().min(1).max(100);
const bounds = { after: timestamp, before: timestamp.optional() };
const fixedBounds = { after: timestamp, before: timestamp };

export const localMailSyncBody = z
  .discriminatedUnion("phase", [
    z.object({ phase: z.literal("capabilities") }),
    z.object({ phase: z.literal("history-baseline"), ...bounds }),
    z.object({
      phase: z.literal("history-backfill"),
      ...fixedBounds,
      cursor: cursor.optional(),
      limit,
    }),
    z.object({ phase: z.literal("history-changes"), ...bounds, cursor, limit }),
    z.object({
      phase: z.literal("history-hydrate"),
      ...bounds,
      messageIds: z.array(id).min(1).max(25),
      stream: z.enum(["backfill", "changes"]),
    }),
    z.object({
      phase: z.literal("folders"),
      parentFolderId: id.optional(),
      cursor: cursor.optional(),
      limit,
    }),
    z.object({
      phase: z.literal("folder-changes"),
      stream: z.enum(["changes", "backfill"]).optional(),
      folderId: id,
      cursor: cursor.optional(),
      limit,
    }),
    z.object({
      phase: z.literal("folder-backfill"),
      folderId: id,
      ...fixedBounds,
      cursor: cursor.optional(),
      limit,
    }),
    z.object({
      phase: z.literal("message-lookup"),
      messageId: id,
      stream: z.enum(["changes", "backfill"]).optional(),
    }),
  ])
  .refine(
    (request) =>
      !("after" in request) ||
      request.before === undefined ||
      request.before > request.after,
    { message: "Mail sync bounds must define a nonempty range" },
  );

export type LocalMailSyncRequest = z.infer<typeof localMailSyncBody>;
