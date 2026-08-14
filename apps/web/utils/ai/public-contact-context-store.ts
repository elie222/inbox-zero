import { PublicContactSnapshotStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import {
  isSafeForSharedCache,
  type PublicContactContext,
  publicContactContextSchema,
} from "@/utils/ai/public-contact-context-schema";
import { hash } from "@/utils/hash";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const FOUND_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const NOT_FOUND_REFRESH_MS = 12 * 60 * 60 * 1000;
const logger = createScopedLogger("ai/public-contact-context-store");

export type StoredPublicContactContext =
  | { status: "found"; context: PublicContactContext }
  | { status: "not_found" }
  | { status: "miss" }
  | { status: "unavailable" };

export async function getStoredPublicContactContext(
  email: string,
): Promise<StoredPublicContactContext> {
  try {
    const snapshot = await prisma.publicContactSnapshot.findFirst({
      where: { identityHash: hash(email) },
      orderBy: [{ researchedAt: "desc" }, { createdAt: "desc" }],
      select: { status: true, context: true, refreshAfter: true },
    });

    if (!snapshot || snapshot.refreshAfter <= new Date()) {
      return { status: "miss" };
    }
    if (snapshot.status === PublicContactSnapshotStatus.NOT_FOUND) {
      return { status: "not_found" };
    }

    const parsed = publicContactContextSchema.safeParse(snapshot.context);
    if (!parsed.success) {
      logger.warn("Ignoring malformed public contact context snapshot", {
        issues: parsed.error.issues.length,
      });
      return { status: "miss" };
    }
    if (!isSafeForSharedCache(parsed.data)) {
      logger.warn("Ignoring unsafe public contact context snapshot");
      return { status: "miss" };
    }

    return { status: "found", context: parsed.data };
  } catch (error) {
    logger.error("Failed to read public contact context history", { error });
    return { status: "unavailable" };
  }
}

export async function storePublicContactContext({
  email,
  context,
  researchedAt,
}: {
  email: string;
  context: PublicContactContext;
  researchedAt: Date;
}): Promise<boolean> {
  const parsed = publicContactContextSchema.safeParse(context);
  if (!parsed.success || !isSafeForSharedCache(parsed.data)) {
    logger.warn("Refusing unsafe public contact context snapshot");
    return false;
  }

  return createSnapshot({
    email,
    status: PublicContactSnapshotStatus.FOUND,
    context: parsed.data,
    researchedAt,
    refreshAfter: new Date(researchedAt.getTime() + FOUND_REFRESH_MS),
  });
}

export async function storePublicContactContextNotFound({
  email,
  researchedAt,
}: {
  email: string;
  researchedAt: Date;
}): Promise<boolean> {
  return createSnapshot({
    email,
    status: PublicContactSnapshotStatus.NOT_FOUND,
    researchedAt,
    refreshAfter: new Date(researchedAt.getTime() + NOT_FOUND_REFRESH_MS),
  });
}

async function createSnapshot({
  email,
  status,
  context,
  researchedAt,
  refreshAfter,
}: {
  email: string;
  status: PublicContactSnapshotStatus;
  context?: PublicContactContext;
  researchedAt: Date;
  refreshAfter: Date;
}) {
  try {
    await prisma.publicContactSnapshot.create({
      data: {
        identityHash: hash(email),
        status,
        ...(context
          ? { context: context as Prisma.InputJsonValue }
          : undefined),
        researchedAt,
        refreshAfter,
      },
    });
    return true;
  } catch (error) {
    logger.error("Failed to append public contact context history", { error });
    return false;
  }
}
