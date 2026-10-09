import { getCampaignName, getWorkflowName } from "@inboxzero/loops";
import { env } from "@/env";
import { Prisma } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const NAME_CACHE_MAX_ENTRIES = 500;
const NAME_LOOKUP_TIMEOUT_MS = 3000;

type LoopsEmailIdentity = {
  sourceType?: string | null;
  loopId?: string | null;
  loopName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  emailMessageId?: string | null;
  eventTime?: Date | null;
};

type LoopsEmailNames = {
  loopName?: string;
  campaignName?: string;
};

type StoredName = {
  loopName: string | null;
  campaignName: string | null;
  eventTime: Date | null;
};

// Loops puts the workflow or campaign name only on send webhooks. Engagement
// events carry the ids, so fill the name from a send we already saw, then from
// the Loops API for sources we have not seen yet.
export async function enrichLoopsEmailNames(
  identity: LoopsEmailIdentity,
  logger: Logger,
): Promise<LoopsEmailNames> {
  const loopName = nonempty(identity.loopName);
  const campaignName = nonempty(identity.campaignName);
  if (loopName || campaignName) {
    await rememberSafely({ ...identity, loopName, campaignName }, logger);
    return {
      loopName: loopName ?? undefined,
      campaignName: campaignName ?? undefined,
    };
  }

  const remembered = await readSafely(identity, logger);
  const resolvedLoopName =
    remembered.loopName ??
    (await resolveMissingName({
      id: nonempty(identity.loopId),
      cacheKey: (id) => `loop:${id}`,
      load: getWorkflowName,
      identity,
      sourceType: "loop",
      logger,
    }));
  const resolvedCampaignName =
    remembered.campaignName ??
    (await resolveMissingName({
      id: nonempty(identity.campaignId),
      cacheKey: (id) => `campaign:${id}`,
      load: getCampaignName,
      identity,
      sourceType: "campaign",
      logger,
    }));

  return {
    loopName: resolvedLoopName ?? undefined,
    campaignName: resolvedCampaignName ?? undefined,
  };
}

async function resolveMissingName({
  id,
  cacheKey,
  load,
  identity,
  sourceType,
  logger,
}: {
  id: string | null;
  cacheKey: (id: string) => string;
  load: (id: string) => Promise<string | null>;
  identity: LoopsEmailIdentity;
  sourceType: "loop" | "campaign";
  logger: Logger;
}): Promise<string | null> {
  if (!id || !env.LOOPS_API_SECRET) return null;

  const key = cacheKey(id);
  // A database outage must not turn every open into a Loops API call.
  const cached = readCachedName(key);
  if (cached) return cached;
  if (recentlyMissed(key)) return null;

  return lookupOnce(key, async () => {
    try {
      const name = nonempty(
        await withTimeout(load(id), NAME_LOOKUP_TIMEOUT_MS),
      );
      if (!name) {
        misses.set(key, Date.now());
        return null;
      }
      rememberCachedName(key, name);
      await rememberSafely(
        {
          ...identity,
          sourceType: nonempty(identity.sourceType) ?? sourceType,
          loopName: sourceType === "loop" ? name : identity.loopName,
          campaignName:
            sourceType === "campaign" ? name : identity.campaignName,
          // Opens and clicks are later than the send. Storing that timestamp
          // would let this version outrank a newer send.
          eventTime: null,
        },
        logger,
      );
      return name;
    } catch (error) {
      // Timeouts and rate limits are retried on a later event. A definitive
      // empty name is the only result cached above.
      logger.warn("Could not load Loops email source name", {
        error,
        loopsSourceKey: key,
      });
      return null;
    }
  });
}

async function readSafely(
  identity: LoopsEmailIdentity,
  logger: Logger,
): Promise<{ loopName: string | null; campaignName: string | null }> {
  try {
    return await readRemembered(identity);
  } catch (error) {
    logger.warn("Could not read remembered Loops email source", { error });
    return { loopName: null, campaignName: null };
  }
}

async function readRemembered(identity: LoopsEmailIdentity): Promise<{
  loopName: string | null;
  campaignName: string | null;
}> {
  const emailMessageId = nonempty(identity.emailMessageId);
  if (emailMessageId) {
    const version = await prisma.loopsEmailSource.findUnique({
      where: { emailMessageId },
      select: { loopName: true, campaignName: true },
    });
    if (version?.loopName || version?.campaignName) return version;
  }

  const loopId = nonempty(identity.loopId);
  if (loopId) {
    const workflow = await prisma.loopsEmailSource.findFirst({
      where: { loopId, loopName: { not: null } },
      orderBy: { eventTime: { sort: "desc", nulls: "last" } },
      select: { loopName: true, campaignName: true },
    });
    if (workflow?.loopName) return workflow;
  }

  const campaignId = nonempty(identity.campaignId);
  if (campaignId) {
    const campaign = await prisma.loopsEmailSource.findFirst({
      where: { campaignId, campaignName: { not: null } },
      orderBy: { eventTime: { sort: "desc", nulls: "last" } },
      select: { loopName: true, campaignName: true },
    });
    if (campaign?.campaignName) return campaign;
  }

  return { loopName: null, campaignName: null };
}

async function rememberSafely(identity: LoopsEmailIdentity, logger: Logger) {
  try {
    await rememberLoopsEmailSource(identity);
  } catch (error) {
    logger.warn("Could not remember Loops email source", { error });
  }
}

async function rememberLoopsEmailSource(identity: LoopsEmailIdentity) {
  const emailMessageId = nonempty(identity.emailMessageId);
  const loopId = nonempty(identity.loopId);
  const loopName = nonempty(identity.loopName);
  const campaignId = nonempty(identity.campaignId);
  const campaignName = nonempty(identity.campaignName);
  const sourceType = sourceTypeFrom(identity);
  const eventTime = identity.eventTime ?? null;
  if (!loopName && !campaignName) return;

  const incoming = { loopName, campaignName, eventTime };
  const data = {
    ...(loopId ? { loopId } : {}),
    ...(loopName ? { loopName } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(campaignName ? { campaignName } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(eventTime ? { eventTime } : {}),
  };

  if (emailMessageId) {
    const existing = await prisma.loopsEmailSource.findUnique({
      where: { emailMessageId },
      select: { loopName: true, campaignName: true, eventTime: true },
    });
    if (existing && keepStoredName(existing, incoming)) return;
    await prisma.loopsEmailSource.upsert({
      where: { emailMessageId },
      create: { emailMessageId, ...data },
      update: data,
    });
    return;
  }

  if (loopId && loopName) {
    await upsertUnversioned({ loopId }, data, incoming);
    return;
  }

  if (campaignId && campaignName) {
    await upsertUnversioned({ campaignId }, data, incoming);
  }
}

async function upsertUnversioned(
  where: { loopId: string } | { campaignId: string },
  data: {
    loopId?: string;
    loopName?: string;
    campaignId?: string;
    campaignName?: string;
    sourceType?: string;
    eventTime?: Date;
  },
  incoming: StoredName,
) {
  const versionless = { ...where, emailMessageId: null };
  const existing = await prisma.loopsEmailSource.findFirst({
    where: versionless,
    select: { id: true, loopName: true, campaignName: true, eventTime: true },
  });
  if (existing) {
    if (keepStoredName(existing, incoming)) return;
    await prisma.loopsEmailSource.update({ where: { id: existing.id }, data });
    return;
  }

  try {
    await prisma.loopsEmailSource.create({ data });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await prisma.loopsEmailSource.findFirst({
      where: versionless,
      select: {
        id: true,
        loopName: true,
        campaignName: true,
        eventTime: true,
      },
    });
    if (!raced) throw error;
    if (keepStoredName(raced, incoming)) return;
    await prisma.loopsEmailSource.update({ where: { id: raced.id }, data });
  }
}

function keepStoredName(
  existing: {
    loopName: string | null;
    campaignName: string | null;
    eventTime: Date | null;
  },
  incoming: StoredName,
) {
  const namesMatch =
    (incoming.loopName == null || existing.loopName === incoming.loopName) &&
    (incoming.campaignName == null ||
      existing.campaignName === incoming.campaignName);
  if (namesMatch) return true;
  if (isNewer(incoming.eventTime, existing.eventTime)) return false;
  return existing.eventTime != null;
}

function isNewer(incoming: Date | null, stored: Date | null) {
  if (!incoming) return false;
  if (!stored) return true;
  return incoming.getTime() > stored.getTime();
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function sourceTypeFrom(identity: LoopsEmailIdentity): string | null {
  const explicit = nonempty(identity.sourceType);
  if (explicit) return explicit;
  if (nonempty(identity.loopId)) return "loop";
  if (nonempty(identity.campaignId)) return "campaign";
  return null;
}

function nonempty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function recentlyMissed(key: string) {
  const missedAt = misses.get(key);
  if (!missedAt) return false;
  if (Date.now() - missedAt < NAME_CACHE_TTL_MS) return true;
  misses.delete(key);
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Loops name lookup timed out"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function lookupOnce(key: string, load: () => Promise<string | null>) {
  const existing = lookups.get(key);
  if (existing) return existing;

  const pending = load().finally(() => {
    lookups.delete(key);
  });
  lookups.set(key, pending);
  return pending;
}

function readCachedName(key: string): string | null {
  const cached = resolvedNames.get(key);
  if (!cached) return null;
  if (Date.now() - cached.storedAt >= NAME_CACHE_TTL_MS) {
    resolvedNames.delete(key);
    return null;
  }
  // Reinsert so a full cache evicts names that have not been used recently.
  resolvedNames.delete(key);
  resolvedNames.set(key, cached);
  return cached.name;
}

function rememberCachedName(key: string, name: string) {
  resolvedNames.delete(key);
  resolvedNames.set(key, { name, storedAt: Date.now() });
  const now = Date.now();
  for (const [cachedKey, cached] of resolvedNames) {
    if (now - cached.storedAt >= NAME_CACHE_TTL_MS) {
      resolvedNames.delete(cachedKey);
    }
  }
  while (resolvedNames.size > NAME_CACHE_MAX_ENTRIES) {
    const oldest = resolvedNames.keys().next().value;
    if (!oldest) return;
    resolvedNames.delete(oldest);
  }
}

const misses = new Map<string, number>();
const resolvedNames = new Map<string, { name: string; storedAt: number }>();
const lookups = new Map<string, Promise<string | null>>();
