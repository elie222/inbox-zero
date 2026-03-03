import type Stripe from "stripe";
import { z } from "zod";
import { getAiGenerationCountByEmailAccounts } from "@inboxzero/tinybird-ai-analytics";
import { env } from "@/env";
import type { PremiumTier } from "@/generated/prisma/enums";
import { getStripe } from "@/ee/billing/stripe";
import { getStripeSubscriptionTier } from "@/app/(app)/premium/config";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const BILLING_UNIT_GENERATIONS = 1000;
const USD_TO_CENTS = 100;

const overageConfigSchema = z.object({
  included: z.number().int().nonnegative(),
  overageUsdPer1000: z.number().positive(),
});

type OverageConfig = z.infer<typeof overageConfigSchema>;

let parsedOverageConfig:
  | Partial<Record<PremiumTier, OverageConfig>>
  | null
  | undefined;

export async function syncAiGenerationOverageForUpcomingInvoice({
  event,
  logger,
}: {
  event: Stripe.Event;
  logger: Logger;
}) {
  if (event.type !== "invoice.upcoming") return;

  const invoice = event.data.object as Stripe.Invoice;

  const invoiceId = invoice.id;
  const customerId = normalizeId(invoice.customer);
  const periodStartMs = toMilliseconds(invoice.period_start);
  const periodEndMs = toMilliseconds(invoice.period_end);

  if (!customerId || periodStartMs == null || periodEndMs == null) {
    logger.warn("Skipping AI overage sync due to missing invoice fields", {
      eventId: event.id,
      hasInvoiceId: !!invoiceId,
      hasCustomerId: !!customerId,
      hasPeriodStart: periodStartMs != null,
      hasPeriodEnd: periodEndMs != null,
    });
    return;
  }

  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: {
      id: true,
      tier: true,
      stripePriceId: true,
      stripeAiOverageLastInvoiceId: true,
      stripeAiOverageLastPeriodEnd: true,
      users: {
        select: {
          emailAccounts: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!premium) return;

  const premiumTier = getPremiumTier(premium.tier, premium.stripePriceId);
  const overageConfig = getTierOverageConfig(premiumTier, logger);

  if (!overageConfig) return;

  const periodEnd = new Date(periodEndMs);
  const alreadyProcessedInvoice = invoiceId
    ? premium.stripeAiOverageLastInvoiceId === invoiceId
    : false;
  const alreadyProcessedPeriod =
    premium.stripeAiOverageLastPeriodEnd?.getTime() === periodEnd.getTime();

  if (alreadyProcessedInvoice || alreadyProcessedPeriod) {
    logger.info("Skipping AI overage sync, invoice period already processed", {
      invoiceId,
      customerId,
      premiumId: premium.id,
    });
    return;
  }

  const emailAccountIds = premium.users.flatMap((user) =>
    user.emailAccounts.map((account) => account.id),
  );

  if (emailAccountIds.length === 0) {
    await saveCheckpoint({
      premiumId: premium.id,
      invoiceId: invoiceId ?? null,
      periodEnd,
      units: 0,
    });
    return;
  }

  const generationCount = await getAiGenerationCountByEmailAccounts({
    emailAccountIds,
    startTimestampMs: periodStartMs,
    endTimestampMs: periodEndMs,
  });

  const includedGenerations = overageConfig.included * emailAccountIds.length;
  const extraGenerations = Math.max(0, generationCount - includedGenerations);
  const overageUnits = Math.ceil(extraGenerations / BILLING_UNIT_GENERATIONS);

  if (overageUnits <= 0) {
    await saveCheckpoint({
      premiumId: premium.id,
      invoiceId: invoiceId ?? null,
      periodEnd,
      units: 0,
    });
    logger.info("No AI overage units for upcoming invoice", {
      invoiceId,
      premiumId: premium.id,
      generationCount,
      includedGenerations,
      accountCount: emailAccountIds.length,
    });
    return;
  }

  const amountCents = Math.round(
    overageUnits * overageConfig.overageUsdPer1000 * USD_TO_CENTS,
  );

  const invoiceItem = {
    customer: customerId,
    currency: "usd",
    amount: amountCents,
    description: `AI generation overage: ${extraGenerations} extra generations (${overageUnits} x ${BILLING_UNIT_GENERATIONS})`,
    metadata: {
      type: "ai_generation_overage",
      premiumId: premium.id,
      generationCount: String(generationCount),
      includedGenerations: String(includedGenerations),
      extraGenerations: String(extraGenerations),
      overageUnits: String(overageUnits),
    },
    ...(invoiceId ? { invoice: invoiceId } : {}),
  };

  await getStripe().invoiceItems.create(invoiceItem, {
    idempotencyKey: getOverageIdempotencyKey({
      invoiceId,
      customerId,
      periodEndMs,
    }),
  });

  await saveCheckpoint({
    premiumId: premium.id,
    invoiceId: invoiceId ?? null,
    periodEnd,
    units: overageUnits,
  });

  logger.info("Added AI overage line item to upcoming Stripe invoice", {
    invoiceId,
    premiumId: premium.id,
    generationCount,
    includedGenerations,
    extraGenerations,
    overageUnits,
    amountCents,
    accountCount: emailAccountIds.length,
  });
}

async function saveCheckpoint({
  premiumId,
  invoiceId,
  periodEnd,
  units,
}: {
  premiumId: string;
  invoiceId: string | null;
  periodEnd: Date;
  units: number;
}) {
  await prisma.premium.update({
    where: { id: premiumId },
    data: {
      stripeAiOverageLastInvoiceId: invoiceId,
      stripeAiOverageLastPeriodEnd: periodEnd,
      stripeAiOverageLastUnits: units,
    },
  });
}

function getTierOverageConfig(
  tier: PremiumTier | null,
  logger: Logger,
): OverageConfig | null {
  if (!tier) return null;

  const config = getParsedOverageConfig(logger);
  return config?.[tier] ?? null;
}

function getParsedOverageConfig(
  logger: Logger,
): Partial<Record<PremiumTier, OverageConfig>> | null {
  if (parsedOverageConfig !== undefined) {
    return parsedOverageConfig;
  }

  const raw = env.STRIPE_AI_GENERATION_OVERAGE_CONFIG;

  if (!raw) {
    parsedOverageConfig = null;
    return parsedOverageConfig;
  }

  try {
    const parsedJson = JSON.parse(raw);
    const parsed = z
      .record(z.string(), overageConfigSchema)
      .safeParse(parsedJson);

    if (!parsed.success) {
      logger.error("Invalid STRIPE_AI_GENERATION_OVERAGE_CONFIG", {
        error: parsed.error,
      });
      parsedOverageConfig = null;
      return parsedOverageConfig;
    }

    parsedOverageConfig = parsed.data as Partial<
      Record<PremiumTier, OverageConfig>
    >;
    return parsedOverageConfig;
  } catch (error) {
    logger.error("Failed to parse STRIPE_AI_GENERATION_OVERAGE_CONFIG", {
      error,
    });
    parsedOverageConfig = null;
    return parsedOverageConfig;
  }
}

function getPremiumTier(
  tier: PremiumTier | null,
  stripePriceId: string | null,
): PremiumTier | null {
  if (tier) return tier;
  if (!stripePriceId) return null;
  return getStripeSubscriptionTier({ priceId: stripePriceId });
}

function normalizeId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

function toMilliseconds(value: number | null | undefined): number | null {
  if (value == null) return null;
  return value * 1000;
}

function getOverageIdempotencyKey({
  invoiceId,
  customerId,
  periodEndMs,
}: {
  invoiceId: string | null;
  customerId: string;
  periodEndMs: number;
}) {
  if (invoiceId) return `ai-overage-${invoiceId}`;
  return `ai-overage-${customerId}-${periodEndMs}`;
}
