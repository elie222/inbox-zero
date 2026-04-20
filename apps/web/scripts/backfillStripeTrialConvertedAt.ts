// Run with:
// `pnpm --filter inbox-zero-ai exec tsx scripts/backfillStripeTrialConvertedAt.ts`
// `pnpm --filter inbox-zero-ai exec tsx scripts/backfillStripeTrialConvertedAt.ts --write`
// `pnpm --filter inbox-zero-ai exec tsx scripts/backfillStripeTrialConvertedAt.ts --premium-id <premiumId> --write`

import "dotenv/config";
import type Stripe from "stripe";
import type { Prisma } from "@/generated/prisma/client";
import { getStripe } from "@/ee/billing/stripe";
import prisma from "@/utils/prisma";

type ScriptOptions = {
  write: boolean;
  limit?: number;
  batchSize: number;
  premiumId?: string;
  subscriptionId?: string;
  verbose: boolean;
};

type PremiumCandidate = {
  id: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripeTrialEnd: Date | null;
};

type ScriptStats = {
  scanned: number;
  updated: number;
  alreadySet: number;
  noSubscription: number;
  noTrial: number;
  stillTrialing: number;
  noPaidInvoiceAfterTrial: number;
  stripeErrors: number;
};

type TrialConversionCandidate = {
  invoiceId: string;
  paidAt: number;
  createdAt: number;
  billingReason: string | null;
  amountDue: number;
  amountPaid: number;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));

  printRunHeader(options);

  const stripe = getStripe();
  const stats: ScriptStats = {
    scanned: 0,
    updated: 0,
    alreadySet: 0,
    noSubscription: 0,
    noTrial: 0,
    stillTrialing: 0,
    noPaidInvoiceAfterTrial: 0,
    stripeErrors: 0,
  };

  let cursor: string | undefined;

  while (true) {
    const premiums = await prisma.premium.findMany({
      where: buildPremiumWhereClause(options),
      select: {
        id: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeSubscriptionStatus: true,
        stripeTrialEnd: true,
      },
      orderBy: { id: "asc" },
      take: getPageSize(options, stats.scanned),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (!premiums.length) break;

    for (const premium of premiums) {
      if (hasReachedLimit(options, stats.scanned)) break;

      stats.scanned += 1;
      await processPremium({
        premium,
        options,
        stats,
        stripe,
      });
    }

    if (hasReachedLimit(options, stats.scanned)) break;

    cursor = premiums[premiums.length - 1]?.id;
  }

  printSummary(stats, options);
}

async function processPremium({
  premium,
  options,
  stats,
  stripe,
}: {
  premium: PremiumCandidate;
  options: ScriptOptions;
  stats: ScriptStats;
  stripe: Stripe;
}) {
  const subscriptionId = premium.stripeSubscriptionId;

  if (!subscriptionId) {
    stats.noSubscription += 1;
    logVerbose(options, "Skipping premium with no Stripe subscription ID", {
      premiumId: premium.id,
      stripeCustomerId: premium.stripeCustomerId,
    });
    return;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const trialEnd = subscription.trial_end;

    if (!trialEnd) {
      stats.noTrial += 1;
      logVerbose(options, "Skipping subscription with no trial_end in Stripe", {
        premiumId: premium.id,
        subscriptionId,
        dbTrialEnd: premium.stripeTrialEnd?.toISOString() ?? null,
        subscriptionStatus: subscription.status,
      });
      return;
    }

    if (subscription.status === "trialing" && trialEnd > getNowUnixSeconds()) {
      stats.stillTrialing += 1;
      logVerbose(options, "Skipping subscription still in trial", {
        premiumId: premium.id,
        subscriptionId,
        trialEnd: toIsoString(trialEnd),
      });
      return;
    }

    const invoices = await listInvoicesCreatedOnOrAfterTrialEnd({
      stripe,
      subscriptionId,
      trialEnd,
    });
    const trialConversion = getTrialConversionCandidate(invoices, trialEnd);

    if (!trialConversion) {
      stats.noPaidInvoiceAfterTrial += 1;
      logVerbose(
        options,
        "No paid invoice found on or after trial end for subscription",
        {
          premiumId: premium.id,
          subscriptionId,
          trialEnd: toIsoString(trialEnd),
          subscriptionStatus: subscription.status,
          invoiceCount: invoices.length,
        },
      );
      return;
    }

    const trialConvertedAt = new Date(trialConversion.paidAt * 1000);

    if (!options.write) {
      process.stdout.write(
        `${[
          "[dry-run] would set stripeTrialConvertedAt",
          `premium=${premium.id}`,
          `subscription=${subscriptionId}`,
          `trialEnd=${toIsoString(trialEnd)}`,
          `trialConvertedAt=${trialConvertedAt.toISOString()}`,
          `invoice=${trialConversion.invoiceId}`,
          `billingReason=${trialConversion.billingReason ?? "unknown"}`,
        ].join(" ")}\n`,
      );
      return;
    }

    const updateResult = await prisma.premium.updateMany({
      where: {
        id: premium.id,
        stripeTrialConvertedAt: null,
      },
      data: {
        stripeTrialConvertedAt: trialConvertedAt,
      },
    });

    if (updateResult.count === 0) {
      stats.alreadySet += 1;
      process.stdout.write(
        `${[
          "[skip] stripeTrialConvertedAt already set",
          `premium=${premium.id}`,
          `subscription=${subscriptionId}`,
        ].join(" ")}\n`,
      );
      return;
    }

    stats.updated += 1;
    process.stdout.write(
      `${[
        "[write] set stripeTrialConvertedAt",
        `premium=${premium.id}`,
        `subscription=${subscriptionId}`,
        `trialEnd=${toIsoString(trialEnd)}`,
        `trialConvertedAt=${trialConvertedAt.toISOString()}`,
        `invoice=${trialConversion.invoiceId}`,
        `billingReason=${trialConversion.billingReason ?? "unknown"}`,
      ].join(" ")}\n`,
    );
  } catch (error) {
    stats.stripeErrors += 1;
    process.stderr.write(
      `${[
        "[error] failed to process premium",
        `premium=${premium.id}`,
        `subscription=${subscriptionId}`,
        `error=${error instanceof Error ? error.message : String(error)}`,
      ].join(" ")}\n`,
    );
  }
}

async function listInvoicesCreatedOnOrAfterTrialEnd({
  stripe,
  subscriptionId,
  trialEnd,
}: {
  stripe: Stripe;
  subscriptionId: string;
  trialEnd: number;
}) {
  const invoices: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.invoices.list({
      subscription: subscriptionId,
      created: { gte: trialEnd },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    invoices.push(...page.data);

    if (!page.has_more || page.data.length === 0) {
      return invoices;
    }

    startingAfter = page.data[page.data.length - 1]?.id;
  }
}

function getTrialConversionCandidate(
  invoices: Stripe.Invoice[],
  trialEnd: number,
) {
  const candidates = invoices
    .flatMap((invoice) => {
      const paidAt = invoice.status_transitions?.paid_at;
      if (!paidAt) return [];
      if (invoice.created < trialEnd) return [];
      if (paidAt < trialEnd) return [];

      const candidate: TrialConversionCandidate = {
        invoiceId: invoice.id,
        paidAt,
        createdAt: invoice.created,
        billingReason: invoice.billing_reason,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
      };

      return [candidate];
    })
    .sort((a, b) => {
      if (a.paidAt !== b.paidAt) return a.paidAt - b.paidAt;
      return a.createdAt - b.createdAt;
    });

  return candidates[0] ?? null;
}

function buildPremiumWhereClause(options: ScriptOptions) {
  const where: Prisma.PremiumWhereInput = {
    stripeTrialConvertedAt: null,
  };

  if (options.premiumId) where.id = options.premiumId;

  if (options.subscriptionId) {
    where.stripeSubscriptionId = options.subscriptionId;
  } else {
    where.stripeSubscriptionId = { not: null };
  }

  return where;
}

function parseOptions(args: string[]): ScriptOptions {
  let write = false;
  let limit: number | undefined;
  let batchSize = 100;
  let premiumId: string | undefined;
  let subscriptionId: string | undefined;
  let verbose = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }

    if (arg === "--write") {
      write = true;
      continue;
    }

    if (arg === "--verbose") {
      verbose = true;
      continue;
    }

    if (arg === "--limit") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --limit");
      limit = parsePositiveInteger(value, "--limit");
      i += 1;
      continue;
    }

    if (arg === "--batch-size") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --batch-size");
      batchSize = parsePositiveInteger(value, "--batch-size");
      i += 1;
      continue;
    }

    if (arg === "--premium-id") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --premium-id");
      premiumId = value;
      i += 1;
      continue;
    }

    if (arg === "--subscription-id") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --subscription-id");
      subscriptionId = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    write,
    batchSize,
    verbose,
    ...(typeof limit === "number" ? { limit } : {}),
    ...(premiumId ? { premiumId } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
  };
}

function printHelpAndExit(): never {
  process.stdout.write(
    "Usage: tsx scripts/backfillStripeTrialConvertedAt.ts [options]\n",
  );
  process.stdout.write("Options:\n");
  process.stdout.write(
    "  --write                      Persist updates. Default is dry-run.\n",
  );
  process.stdout.write(
    "  --limit <n>                  Maximum number of premiums to scan.\n",
  );
  process.stdout.write(
    "  --batch-size <n>             Number of premiums to fetch per DB page. Default: 100.\n",
  );
  process.stdout.write(
    "  --premium-id <id>            Only process one Premium row.\n",
  );
  process.stdout.write(
    "  --subscription-id <id>       Only process one Stripe subscription.\n",
  );
  process.stdout.write(
    "  --verbose                    Print skip reasons while scanning.\n",
  );
  process.stdout.write(
    "  -h, --help                   Show this help message.\n",
  );
  process.exit(0);
}

function printRunHeader(options: ScriptOptions) {
  process.stdout.write(
    `${[
      "Starting Stripe trial conversion backfill",
      `mode=${options.write ? "write" : "dry-run"}`,
      `batchSize=${options.batchSize}`,
      `limit=${options.limit ?? "none"}`,
      `premiumId=${options.premiumId ?? "all"}`,
      `subscriptionId=${options.subscriptionId ?? "all"}`,
    ].join(" ")}\n`,
  );
}

function printSummary(stats: ScriptStats, options: ScriptOptions) {
  process.stdout.write("\nSummary\n");
  process.stdout.write(`  mode: ${options.write ? "write" : "dry-run"}\n`);
  process.stdout.write(`  scanned: ${stats.scanned}\n`);
  process.stdout.write(`  updated: ${stats.updated}\n`);
  process.stdout.write(`  already set: ${stats.alreadySet}\n`);
  process.stdout.write(`  no subscription id: ${stats.noSubscription}\n`);
  process.stdout.write(`  no trial in Stripe: ${stats.noTrial}\n`);
  process.stdout.write(`  still trialing: ${stats.stillTrialing}\n`);
  process.stdout.write(
    `  no paid invoice after trial: ${stats.noPaidInvoiceAfterTrial}\n`,
  );
  process.stdout.write(`  stripe errors: ${stats.stripeErrors}\n`);
}

function getPageSize(options: ScriptOptions, scanned: number) {
  if (!options.limit) return options.batchSize;
  return Math.min(options.batchSize, Math.max(options.limit - scanned, 1));
}

function hasReachedLimit(options: ScriptOptions, scanned: number) {
  return typeof options.limit === "number" && scanned >= options.limit;
}

function parsePositiveInteger(value: string, flagName: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }

  return parsed;
}

function logVerbose(
  options: ScriptOptions,
  message: string,
  details: Record<string, unknown>,
) {
  if (!options.verbose) return;
  process.stdout.write(`${message} ${JSON.stringify(details)}\n`);
}

function getNowUnixSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toIsoString(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString();
}

main()
  .catch((error) => {
    process.stderr.write(
      `Failed to backfill stripeTrialConvertedAt: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
