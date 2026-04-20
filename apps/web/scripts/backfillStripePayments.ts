// Run with:
// `pnpm --filter inbox-zero-ai exec tsx scripts/backfillStripePayments.ts`
// `pnpm --filter inbox-zero-ai exec tsx scripts/backfillStripePayments.ts --write`
// `pnpm --filter inbox-zero-ai exec tsx scripts/backfillStripePayments.ts --premium-id <premiumId> --write`

import "dotenv/config";
import { getStripe } from "@/ee/billing/stripe";
import { upsertStripeInvoicePayment } from "@/ee/billing/stripe/payments";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

type ScriptOptions = {
  write: boolean;
  limit?: number;
  batchSize: number;
  premiumId?: string;
  customerId?: string;
};

type ScriptStats = {
  scannedPremiums: number;
  scannedInvoices: number;
  skippedDraftInvoices: number;
  upsertedInvoices: number;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const stripe = getStripe();
  const logger = createScopedLogger("scripts/backfill-stripe-payments");
  const stats: ScriptStats = {
    scannedPremiums: 0,
    scannedInvoices: 0,
    skippedDraftInvoices: 0,
    upsertedInvoices: 0,
  };

  process.stdout.write(
    `${[
      "Starting Stripe payment backfill",
      `mode=${options.write ? "write" : "dry-run"}`,
      `batchSize=${options.batchSize}`,
      `limit=${options.limit ?? "none"}`,
      `premiumId=${options.premiumId ?? "all"}`,
      `customerId=${options.customerId ?? "all"}`,
    ].join(" ")}\n`,
  );

  let cursor: string | undefined;

  while (true) {
    const premiums = await prisma.premium.findMany({
      where: {
        ...(options.premiumId ? { id: options.premiumId } : {}),
        ...(options.customerId
          ? { stripeCustomerId: options.customerId }
          : { stripeCustomerId: { not: null } }),
      },
      select: {
        id: true,
        stripeCustomerId: true,
      },
      orderBy: { id: "asc" },
      take: getPageSize(options, stats.scannedPremiums),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (!premiums.length) break;

    for (const premium of premiums) {
      if (hasReachedLimit(options, stats.scannedPremiums)) break;
      if (!premium.stripeCustomerId) continue;

      stats.scannedPremiums += 1;

      const invoices = await listCustomerInvoices(
        stripe,
        premium.stripeCustomerId,
      );

      for (const invoice of invoices) {
        stats.scannedInvoices += 1;

        if (invoice.status === "draft") {
          stats.skippedDraftInvoices += 1;
          continue;
        }

        if (!options.write) {
          process.stdout.write(
            `${[
              "[dry-run] would upsert Stripe payment",
              `premium=${premium.id}`,
              `customer=${premium.stripeCustomerId}`,
              `invoice=${invoice.id}`,
              `status=${invoice.status ?? "unknown"}`,
              `total=${invoice.total}`,
            ].join(" ")}\n`,
          );
          continue;
        }

        await upsertStripeInvoicePayment({
          invoice,
          logger,
          context: {
            source: "backfill",
            premiumId: premium.id,
          },
        });
        stats.upsertedInvoices += 1;
      }
    }

    if (hasReachedLimit(options, stats.scannedPremiums)) break;
    cursor = premiums[premiums.length - 1]?.id;
  }

  process.stdout.write("\nSummary\n");
  process.stdout.write(`  mode: ${options.write ? "write" : "dry-run"}\n`);
  process.stdout.write(`  scanned premiums: ${stats.scannedPremiums}\n`);
  process.stdout.write(`  scanned invoices: ${stats.scannedInvoices}\n`);
  process.stdout.write(
    `  skipped draft invoices: ${stats.skippedDraftInvoices}\n`,
  );
  process.stdout.write(`  upserted invoices: ${stats.upsertedInvoices}\n`);
}

async function listCustomerInvoices(
  stripe: ReturnType<typeof getStripe>,
  customerId: string,
) {
  const invoices = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.invoices.list({
      customer: customerId,
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

function parseOptions(args: string[]): ScriptOptions {
  let write = false;
  let limit: number | undefined;
  let batchSize = 100;
  let premiumId: string | undefined;
  let customerId: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }

    if (arg === "--write") {
      write = true;
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

    if (arg === "--customer-id") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --customer-id");
      customerId = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    write,
    batchSize,
    ...(typeof limit === "number" ? { limit } : {}),
    ...(premiumId ? { premiumId } : {}),
    ...(customerId ? { customerId } : {}),
  };
}

function printHelpAndExit(): never {
  process.stdout.write(
    "Usage: tsx scripts/backfillStripePayments.ts [options]\n",
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
    "  --customer-id <id>           Only process one Stripe customer.\n",
  );
  process.stdout.write(
    "  -h, --help                   Show this help message.\n",
  );
  process.exit(0);
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

main()
  .catch((error) => {
    process.stderr.write(
      `Failed to backfill Stripe payments: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
