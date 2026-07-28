import { ContactCardExchangeStatus } from "@/generated/prisma/enums";
import type { ContactCardExchangeBody } from "@/utils/actions/contact-card.validation";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import {
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
} from "@/utils/rate-limit";

// Anyone with the link can post here, so the limits are deliberately tight —
// a real person swapping details submits once. Both limits must pass: the
// per-visitor one stops one person spamming, the per-card one stops a
// distributed flood filling someone's review list.
const PER_VISITOR_LIMIT = { limit: 5, windowSeconds: 60 * 60 };
const PER_CARD_LIMIT = { limit: 40, windowSeconds: 60 * 60 };

export async function submitContactCardExchange({
  slug,
  submission,
  headers,
  logger,
}: {
  slug: string;
  submission: ContactCardExchangeBody;
  headers: Headers;
  logger: Logger;
}): Promise<{ received: true }> {
  const card = await prisma.contactCard.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  // Same response either way: whether a slug exists isn't worth leaking
  if (!card) throw new SafeError("Card not found", 404);

  await enforceRateLimits({ slug, cardId: card.id, headers, logger });

  await prisma.contactCardExchange.create({
    data: {
      contactCardId: card.id,
      name: submission.name.trim(),
      email: submission.email.trim().toLowerCase(),
      phone: blankToNull(submission.phone),
      companyTitle: blankToNull(submission.companyTitle),
      note: blankToNull(submission.note),
    },
  });

  // The submission itself is a stranger's personal details — count it, don't
  // log it
  logger.info("Contact card exchange received", { slug });

  return { received: true };
}

// Pending submissions for the account's own card, newest first
export async function getPendingExchanges(emailAccountId: string) {
  return prisma.contactCardExchange.findMany({
    where: {
      status: ContactCardExchangeStatus.PENDING,
      contactCard: { emailAccountId },
    },
    select: {
      id: true,
      createdAt: true,
      name: true,
      email: true,
      phone: true,
      companyTitle: true,
      note: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export type PendingExchange = Awaited<
  ReturnType<typeof getPendingExchanges>
>[number];

async function enforceRateLimits({
  slug,
  cardId,
  headers,
  logger,
}: {
  slug: string;
  cardId: string;
  headers: Headers;
  logger: Logger;
}) {
  const rules = [
    {
      key: createRateLimitKey([
        "contact-card-exchange",
        slug,
        getClientIp(headers),
      ]),
      ...PER_VISITOR_LIMIT,
    },
    {
      key: createRateLimitKey(["contact-card-exchange-card", cardId]),
      ...PER_CARD_LIMIT,
    },
  ];

  for (const rule of rules) {
    const result = await checkRateLimit({ rule, logger });
    if (result.limited) {
      logger.warn("Contact card exchange rate limited", { slug });
      throw new SafeError("Too many submissions — try again later", 429);
    }
  }
}

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
