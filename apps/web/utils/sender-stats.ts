import { z } from "zod";
import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";

export const senderStatsOrderBySchema = z.enum([
  "emails",
  "unread",
  "unarchived",
  "newest",
]);
export type SenderStatsOrderBy = z.infer<typeof senderStatsOrderBySchema>;

export type SenderEmailStats = {
  from: string;
  fromName: string | null;
  minFromName: string | null;
  count: number;
  inboxEmails: number;
  readEmails: number;
  unsubscribeLink: string | null;
  /** Unix timestamp in milliseconds of the sender's most recent message. */
  lastEmailAt: number | null;
};

export type SenderEmailStatsPage = {
  senders: SenderEmailStats[];
  nextCursor: string | null;
};

export type SenderEmailStatsOptions = {
  emailAccountId: string;
  /** Unix timestamp in milliseconds */
  fromDate?: number | null;
  /** Unix timestamp in milliseconds */
  toDate?: number | null;
  read?: boolean;
  unread?: boolean;
  archived?: boolean;
  unarchived?: boolean;
  search?: string;
  orderBy?: SenderStatsOrderBy | null;
  orderDirection?: "asc" | "desc" | null;
  limit?: number | null;
  /** Opaque cursor from a previous page. Must use the same sort. */
  cursor?: string | null;
};

type SenderEmailStatsRow = Omit<SenderEmailStats, "lastEmailAt"> & {
  lastEmailAt: bigint | number | null;
};

const senderStatsCursorSchema = z.object({
  v: z.literal(1),
  orderBy: senderStatsOrderBySchema,
  orderDirection: z.enum(["asc", "desc"]),
  from: z.string().min(1).max(320),
  count: z.number().int().positive().optional(),
  readEmails: z.number().int().nonnegative().optional(),
  archivedEmails: z.number().int().nonnegative().optional(),
  lastEmailAt: z.number().int().nonnegative().optional(),
});

type SenderStatsCursor = z.infer<typeof senderStatsCursorSchema>;

/**
 * Aggregates per-sender email stats from the EmailMessage table.
 * Powers the bulk unsubscribe page and the inbox health email.
 *
 * Omit `limit` to return every sender. Pass `limit` (and `cursor` from
 * `nextCursor`) to page. The extra tie-break on sender address keeps pages
 * stable when sort keys match.
 */
export async function getSenderEmailStats(
  options: SenderEmailStatsOptions,
): Promise<SenderEmailStatsPage> {
  const orderBy = options.orderBy ?? "emails";
  const orderDirection = options.orderDirection ?? "desc";
  const cursor = options.cursor
    ? decodeSenderStatsCursor({
        cursor: options.cursor,
        orderBy,
        orderDirection,
      })
    : null;
  const pageSize = positiveInteger(options.limit);

  const whereConditions: Prisma.Sql[] = [];

  if (options.fromDate) {
    const fromTimestamp = (options.fromDate / 1000).toString();
    whereConditions.push(
      Prisma.sql`"date" >= to_timestamp(${fromTimestamp}::double precision)`,
    );
  }

  if (options.toDate) {
    const toTimestamp = (options.toDate / 1000).toString();
    whereConditions.push(
      Prisma.sql`"date" <= to_timestamp(${toTimestamp}::double precision)`,
    );
  }

  if (options.read) {
    whereConditions.push(Prisma.sql`read = true`);
  } else if (options.unread) {
    whereConditions.push(Prisma.sql`read = false`);
  }

  if (options.unarchived) {
    whereConditions.push(Prisma.sql`inbox = true`);
  } else if (options.archived) {
    whereConditions.push(Prisma.sql`inbox = false`);
  }

  whereConditions.push(
    Prisma.sql`"emailAccountId" = ${options.emailAccountId}`,
  );

  if (options.search) {
    const searchTerm = options.search.toLowerCase();
    whereConditions.push(
      Prisma.sql`(position(${searchTerm} in LOWER("from")) > 0 OR position(${searchTerm} in LOWER(COALESCE("fromName", ''))) > 0)`,
    );
  }

  const whereClause =
    whereConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`
      : Prisma.empty;

  const orderByClause = getOrderByClause(orderBy, orderDirection);
  const cursorClause = cursor ? senderStatsCursorClause(cursor) : Prisma.empty;
  // Fetch one extra row to decide whether another page exists.
  const fetchLimit = pageSize ? pageSize + 1 : null;
  const limitClause =
    fetchLimit === null ? Prisma.empty : Prisma.raw(`LIMIT ${fetchLimit}`);

  const query = Prisma.sql`
    WITH email_message_stats AS (
      SELECT
        LOWER("from") AS "from",
        MAX(NULLIF("fromName", '')) as "fromName",
        MIN(NULLIF("fromName", '')) as "minFromName",
        COUNT(*)::int as "count",
        SUM(CASE WHEN inbox = true THEN 1 ELSE 0 END)::int as "inboxEmails",
        SUM(CASE WHEN read = true THEN 1 ELSE 0 END)::int as "readEmails",
        MAX("unsubscribeLink") as "unsubscribeLink",
        (EXTRACT(EPOCH FROM MAX("date")) * 1000)::bigint as "lastEmailAt"
      FROM "EmailMessage"
      ${whereClause}
      GROUP BY LOWER("from")
    )
    SELECT * FROM email_message_stats
    ${cursorClause}
    ORDER BY ${Prisma.raw(orderByClause)}
    ${limitClause}
  `;

  const results = await prisma.$queryRaw<SenderEmailStatsRow[]>(query);
  const senders = results.map(toSenderEmailStats);
  const hasMore = pageSize !== null && senders.length > pageSize;
  const page = hasMore ? senders.slice(0, pageSize) : senders;
  const lastSender = page.at(-1);

  return {
    senders: page,
    nextCursor:
      hasMore && lastSender
        ? encodeSenderStatsCursor(lastSender, orderBy, orderDirection)
        : null,
  };
}

function toSenderEmailStats(result: SenderEmailStatsRow): SenderEmailStats {
  return {
    from: result.from,
    fromName: result.fromName,
    minFromName: result.minFromName,
    count: Number(result.count),
    inboxEmails: Number(result.inboxEmails),
    readEmails: Number(result.readEmails),
    unsubscribeLink: result.unsubscribeLink,
    lastEmailAt: result.lastEmailAt == null ? null : Number(result.lastEmailAt),
  };
}

function positiveInteger(limit?: number | null) {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) {
    return null;
  }

  return Math.floor(limit);
}

function getOrderByClause(
  orderBy: SenderStatsOrderBy,
  orderDirection: "asc" | "desc",
): string {
  const direction = orderDirection === "asc" ? "ASC" : "DESC";
  const nulls = direction === "ASC" ? "NULLS FIRST" : "NULLS LAST";

  switch (orderBy) {
    case "unread":
      return `"readEmails"::float / NULLIF("count", 0) ${direction}, "from" ASC`;
    case "unarchived":
      return `("count" - "inboxEmails")::float / NULLIF("count", 0) ${direction}, "from" ASC`;
    case "newest":
      return `"lastEmailAt" ${direction} ${nulls}, "from" ASC`;
    case "emails":
      return `"count" ${direction}, "from" ASC`;
  }
}

function encodeSenderStatsCursor(
  sender: SenderEmailStats,
  orderBy: SenderStatsOrderBy,
  orderDirection: "asc" | "desc",
): string | null {
  const payload: SenderStatsCursor = {
    v: 1,
    orderBy,
    orderDirection,
    from: sender.from,
  };

  switch (orderBy) {
    case "emails":
      payload.count = sender.count;
      break;
    case "unread":
      payload.count = sender.count;
      payload.readEmails = sender.readEmails;
      break;
    case "unarchived":
      payload.count = sender.count;
      payload.archivedEmails = sender.count - sender.inboxEmails;
      break;
    case "newest":
      // `date` is required, so this is only a guard for a null aggregate.
      if (sender.lastEmailAt == null) return null;
      payload.lastEmailAt = sender.lastEmailAt;
      break;
  }

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSenderStatsCursor({
  cursor,
  orderBy,
  orderDirection,
}: {
  cursor: string;
  orderBy: SenderStatsOrderBy;
  orderDirection: "asc" | "desc";
}): SenderStatsCursor {
  let parsed: SenderStatsCursor;
  try {
    parsed = senderStatsCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new SafeError("Invalid cursor", 400);
  }

  if (parsed.orderBy !== orderBy || parsed.orderDirection !== orderDirection) {
    throw new SafeError("Cursor does not match the requested sort", 400);
  }

  if (!cursorHasSortKey(parsed)) {
    throw new SafeError("Invalid cursor", 400);
  }

  return parsed;
}

function cursorHasSortKey(cursor: SenderStatsCursor) {
  switch (cursor.orderBy) {
    case "emails":
      return cursor.count != null;
    case "unread":
      return cursor.count != null && cursor.readEmails != null;
    case "unarchived":
      return cursor.count != null && cursor.archivedEmails != null;
    case "newest":
      return cursor.lastEmailAt != null;
  }
}

function senderStatsCursorClause(cursor: SenderStatsCursor): Prisma.Sql {
  const descending = cursor.orderDirection === "desc";
  const laterFrom = Prisma.sql`"from" > ${cursor.from}`;

  switch (cursor.orderBy) {
    case "emails": {
      const before = descending
        ? Prisma.sql`"count" < ${cursor.count}`
        : Prisma.sql`"count" > ${cursor.count}`;
      return Prisma.sql`WHERE ${before} OR ("count" = ${cursor.count} AND ${laterFrom})`;
    }
    case "unread": {
      const left = Prisma.sql`("readEmails"::bigint * ${cursor.count}::bigint)`;
      const right = Prisma.sql`(${cursor.readEmails}::bigint * "count"::bigint)`;
      const before = descending
        ? Prisma.sql`${left} < ${right}`
        : Prisma.sql`${left} > ${right}`;
      return Prisma.sql`WHERE ${before} OR (${left} = ${right} AND ${laterFrom})`;
    }
    case "unarchived": {
      const left = Prisma.sql`(("count" - "inboxEmails")::bigint * ${cursor.count}::bigint)`;
      const right = Prisma.sql`(${cursor.archivedEmails}::bigint * "count"::bigint)`;
      const before = descending
        ? Prisma.sql`${left} < ${right}`
        : Prisma.sql`${left} > ${right}`;
      return Prisma.sql`WHERE ${before} OR (${left} = ${right} AND ${laterFrom})`;
    }
    case "newest": {
      const before = descending
        ? Prisma.sql`"lastEmailAt" < ${cursor.lastEmailAt}`
        : Prisma.sql`"lastEmailAt" > ${cursor.lastEmailAt}`;
      return Prisma.sql`WHERE ${before} OR ("lastEmailAt" = ${cursor.lastEmailAt} AND ${laterFrom})`;
    }
  }
}
