import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import { redis } from "@/utils/redis";
import { isDefined } from "@/utils/types";
import { runWithBoundedConcurrency } from "@/utils/async";

// The mail sidebar fills counts in after first paint, so this must degrade
// rather than hang: a slow provider is worth less than an empty sidebar.
export const maxDuration = 15;

const CACHE_KEY_PREFIX = "label-counts";
const CACHE_TTL_SECONDS = 60;
const MAX_USER_LABELS = 100;
const LABEL_LOOKUP_CONCURRENCY = 8;

export type LabelCount = {
  id: string;
  name: string;
  kind: "system" | "category" | "label" | "folder";
  /** Conversations or folder items in this scope, unread ones included. */
  total: number;
  unread: number;
};

export type LabelCountsResponse = {
  counts: LabelCount[];
  /** Some counts are missing: a provider that can't report them, or a failed lookup */
  partial: boolean;
};

// `anyFailed` distinguishes "this provider can't report everything" from "a
// lookup broke", so only the latter keeps a bad result out of the cache.
type CountsResult = LabelCountsResponse & { anyFailed: boolean };

const EMPTY_RESPONSE: CountsResult = {
  counts: [],
  partial: true,
  anyFailed: true,
};

// Gmail's system labels the sidebar shows. Archived has no label of its own.
const SYSTEM_LABELS = [
  { id: GmailLabel.INBOX, name: "Inbox" },
  { id: GmailLabel.DRAFT, name: "Drafts" },
  { id: GmailLabel.SENT, name: "Sent" },
];

const CATEGORY_LABELS = [
  { id: GmailLabel.PERSONAL, name: "Primary" },
  { id: GmailLabel.SOCIAL, name: "Social" },
  { id: GmailLabel.PROMOTIONS, name: "Promotions" },
  { id: GmailLabel.UPDATES, name: "Updates" },
  { id: GmailLabel.FORUMS, name: "Forums" },
];

export const GET = withEmailProvider(
  "labels/counts",
  async (request) => {
    const { emailProvider, logger } = request;
    const { emailAccountId } = request.auth;

    const cached = await getCachedCounts(emailAccountId, logger);
    if (cached) return NextResponse.json(cached);

    const { anyFailed, ...response } = await getCounts({
      emailProvider,
      logger,
    });
    // A transient lookup failure must not be frozen in the cache for a minute.
    if (response.counts.length && !anyFailed) {
      await setCachedCounts(emailAccountId, response, logger);
    }

    return NextResponse.json(response);
  },
  { requestTiming: {} },
);

async function getCounts({
  emailProvider,
  logger,
}: {
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<CountsResult> {
  try {
    if (isGoogleProvider(emailProvider.name)) {
      return await getGmailCounts({ emailProvider, logger });
    }

    const folderCounts = await emailProvider.getFolderCounts();
    return {
      counts: folderCounts.map((folder) => ({
        id: folder.systemType ?? folder.id,
        name: folder.name,
        kind: folder.systemType ? "system" : "folder",
        total: folder.total,
        unread: folder.unread,
      })),
      partial: false,
      anyFailed: false,
    };
  } catch (error) {
    logger.warn("Failed to fetch label counts", { error });
    return EMPTY_RESPONSE;
  }
}

async function getGmailCounts({
  emailProvider,
  logger,
}: {
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<CountsResult> {
  const userLabels = await emailProvider.getLabels();

  const targets: Array<Pick<LabelCount, "id" | "name" | "kind">> = [
    ...SYSTEM_LABELS.map((label) => ({ ...label, kind: "system" as const })),
    ...CATEGORY_LABELS.map((label) => ({
      ...label,
      kind: "category" as const,
    })),
    ...userLabels.slice(0, MAX_USER_LABELS).map((label) => ({
      id: label.id,
      name: label.name,
      kind: "label" as const,
    })),
  ];

  // Gmail's `labels.list` carries no counts, so each label needs its own
  // `labels.get`. Bounded so a label-heavy account doesn't fire a hundred
  // requests at once, and one failure must not cost us the rest of the sidebar.
  let anyFailed = false;
  const settled = await runWithBoundedConcurrency({
    items: targets,
    concurrency: LABEL_LOOKUP_CONCURRENCY,
    run: async (target) => {
      const label = await emailProvider.getLabelById(target.id);
      if (!label) return null;
      return {
        ...target,
        total: label.threadsTotal ?? 0,
        unread: label.threadsUnread ?? 0,
      };
    },
  });

  const counts = settled
    .map(({ item, result }) => {
      if (result.status === "fulfilled") {
        // The Gmail provider turns a failed lookup into a null rather than a
        // rejection, so a null is a failure too — otherwise a transient miss
        // gets frozen in the cache for a minute.
        if (result.value === null) anyFailed = true;
        return result.value;
      }
      anyFailed = true;
      logger.warn("Failed to fetch count for label", {
        labelId: item.id,
        error: result.reason,
      });
      return null;
    })
    .filter(isDefined);

  return {
    counts,
    // `partial` is also true for providers that simply can't report everything,
    // so it can't gate caching on its own — see the failure flag below.
    partial:
      counts.length < targets.length || userLabels.length > MAX_USER_LABELS,
    anyFailed,
  };
}

function getCacheKey(emailAccountId: string) {
  return `${CACHE_KEY_PREFIX}:${emailAccountId}`;
}

async function getCachedCounts(emailAccountId: string, logger: Logger) {
  try {
    return await redis.get<LabelCountsResponse>(getCacheKey(emailAccountId));
  } catch (error) {
    logger.warn("Failed to read cached label counts", { error });
    return null;
  }
}

async function setCachedCounts(
  emailAccountId: string,
  response: LabelCountsResponse,
  logger: Logger,
) {
  try {
    await redis.set(getCacheKey(emailAccountId), response, {
      ex: CACHE_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("Failed to cache label counts", { error });
  }
}
