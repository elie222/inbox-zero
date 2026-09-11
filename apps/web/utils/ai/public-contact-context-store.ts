import type { Prisma } from "@/generated/prisma/client";
import {
  isSafeForSharedCache,
  type PublicContactContext,
  publicContactContextSchema,
} from "@/utils/ai/public-contact-context-schema";
import { canonicalizeEmailAddress } from "@/utils/email";
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
    const research = await prisma.contactResearch.findFirst({
      where: { email: canonicalizeEmailAddress(email) },
      // Start-time ordering keeps an expired-lock worker that finishes late
      // from replacing research that began more recently.
      orderBy: [
        { researchStartedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: {
        found: true,
        role: true,
        company: true,
        sources: true,
        confidence: true,
        researchStartedAt: true,
      },
    });

    if (!research) {
      return { status: "miss" };
    }

    const refreshMs = research.found ? FOUND_REFRESH_MS : NOT_FOUND_REFRESH_MS;
    if (research.researchStartedAt.getTime() + refreshMs <= Date.now()) {
      return { status: "miss" };
    }
    if (!research.found) {
      return { status: "not_found" };
    }

    const parsed = publicContactContextSchema.safeParse({
      role: research.role,
      company: research.company,
      sources: research.sources,
      confidence: research.confidence,
    });
    if (!parsed.success) {
      logger.warn("Ignoring malformed public contact research", {
        issues: parsed.error.issues.length,
      });
      return { status: "miss" };
    }
    if (!isSafeForSharedCache(parsed.data)) {
      logger.warn("Ignoring unsafe public contact research");
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
  researchStartedAt,
}: {
  email: string;
  context: PublicContactContext;
  researchStartedAt: Date;
}): Promise<boolean> {
  const parsed = publicContactContextSchema.safeParse(context);
  if (!parsed.success || !isSafeForSharedCache(parsed.data)) {
    logger.warn("Refusing unsafe public contact research");
    return false;
  }

  return createResearch({
    email: canonicalizeEmailAddress(email),
    found: true,
    role: parsed.data.role,
    confidence: parsed.data.confidence,
    ...(parsed.data.company
      ? { company: parsed.data.company as Prisma.InputJsonValue }
      : undefined),
    sources: parsed.data.sources,
    researchStartedAt,
  });
}

export async function storePublicContactContextNotFound({
  email,
  researchStartedAt,
}: {
  email: string;
  researchStartedAt: Date;
}): Promise<boolean> {
  return createResearch({
    email: canonicalizeEmailAddress(email),
    found: false,
    researchStartedAt,
  });
}

async function createResearch(data: Prisma.ContactResearchCreateInput) {
  try {
    await prisma.contactResearch.create({ data });
    return true;
  } catch (error) {
    logger.error("Failed to append public contact research history", { error });
    return false;
  }
}
