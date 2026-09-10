import { z } from "zod";
import { MAX_SPLIT_FILTERS } from "@/utils/mail/split-filters";
import { MAX_SPLIT_LABELS } from "@/utils/mail/split-constants";
import { microsoftGraphPageTokenSchema } from "@/utils/outlook/page-token";
import { createSearchParams } from "@/utils/url";

/**
 * One branch of a "match any" split. Leaves are single conditions, so the
 * provider can OR them without having to interpret a nested expression.
 */
const threadsQueryLeaf = z
  .strictObject({
    labelId: z.string().trim().min(1).nullish(),
    fromEmail: z.string().trim().min(1).nullish(),
    isUnread: z.literal(true).nullish(),
    before: z.coerce.date().nullish(),
    inboxSection: z.enum(["focused", "other"]).nullish(),
  })
  .refine(
    (leaf) =>
      Object.values(leaf).filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== "" &&
          value !== false,
      ).length === 1,
    { message: "Each match-any branch must contain one condition" },
  );
export type ThreadsQueryLeaf = z.infer<typeof threadsQueryLeaf>;

export const threadsQuery = z
  .object({
    q: z.string().nullish(),
    fromEmail: z.string().nullish(),
    limit: z.coerce.number().max(100).nullish(),
    type: z.string().nullish(),
    folderId: z.string().nullish(), // For Outlook
    inboxSection: z.enum(["focused", "other"]).nullish(),
    nextPageToken: microsoftGraphPageTokenSchema,
    labelId: z.string().nullish(), // For Google
    labelIds: z.array(z.string()).nullish(), // For Google
    // Threads matching any one of these labels, on top of `labelIds`, which all
    // have to match. Served by fanning out one provider query per label.
    anyLabelIds: z.array(z.string()).max(MAX_SPLIT_LABELS).nullish(),
    excludeLabelNames: z.array(z.string()).nullish(), // For Google
    after: z.coerce.date().nullish(),
    before: z.coerce.date().nullish(),
    isUnread: z.coerce.boolean().nullish(),
    /**
     * Match any one of these, ANDed with the rest of the query. Travels over the
     * wire as JSON, since a list of objects has no natural query-string form.
     */
    anyOf: z.preprocess(
      (value) => (typeof value === "string" ? parseAnyOf(value) : value),
      z.array(threadsQueryLeaf).max(MAX_SPLIT_FILTERS).nullish(),
    ),
  })
  .refine(
    (query) =>
      !query.anyOf?.length ||
      (!query.q &&
        !query.anyLabelIds?.length &&
        !query.folderId &&
        (!query.type || query.type === "inbox")),
    {
      message:
        "Match-any conditions require an inbox query without search or label unions",
    },
  );
export type ThreadsQuery = z.infer<typeof threadsQuery>;

// Opt-in slim response for list rows. Anything unrecognised falls back to the
// full response so a bad param can never drop data a caller depends on.
export const threadsView = z.enum(["full", "list"]).catch("full");

/** Preserve invalid input so validation rejects it instead of widening the query. */
function parseAnyOf(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Serialises a query for `/api/threads`, JSON-encoding the `anyOf` branches. */
export function threadsQueryToSearchParams(
  query: ThreadsQuery & Record<string, unknown>,
) {
  const { anyOf, ...rest } = query;
  return createSearchParams({
    ...rest,
    ...(anyOf?.length ? { anyOf: JSON.stringify(anyOf) } : {}),
  });
}
