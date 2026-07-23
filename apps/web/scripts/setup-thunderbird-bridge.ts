/**
 * Creates a local Thunderbird bridge user + optional starter email account.
 *
 * Usage:
 *   cd apps/web
 *   pnpm exec dotenv -e .env.local -- tsx scripts/setup-thunderbird-bridge.ts
 *   pnpm exec dotenv -e .env.local -- tsx scripts/setup-thunderbird-bridge.ts you@example.com
 *   pnpm exec dotenv -e .env.local -- tsx scripts/setup-thunderbird-bridge.ts you@example.com testuser@gmail.com
 *
 * Optional 2nd arg: existing Inbox Zero user email that should own the mailbox in the web UI.
 */
import prisma from "@/utils/prisma";
import { ActionType, PremiumTier } from "@/generated/prisma/enums";

const BRIDGE_USER_EMAIL = "thunderbird-bridge@localhost";

async function main() {
  const accountEmail = process.argv[2]?.toLowerCase();
  const ownerEmail = process.argv[3]?.toLowerCase();

  const user = await prisma.user.upsert({
    where: { email: BRIDGE_USER_EMAIL },
    create: {
      email: BRIDGE_USER_EMAIL,
      name: "Thunderbird Bridge",
      emailVerified: true,
      completedOnboardingAt: new Date(),
    },
    update: {
      name: "Thunderbird Bridge",
      completedOnboardingAt: new Date(),
    },
  });

  const owner = ownerEmail
    ? await prisma.user.findUnique({ where: { email: ownerEmail } })
    : null;
  if (ownerEmail && !owner) {
    throw new Error(`Owner user not found: ${ownerEmail}`);
  }
  const ownerUserId = owner?.id || user.id;

  const existingPremium = await prisma.premium.findFirst({
    where: { users: { some: { id: user.id } } },
  });

  if (!existingPremium) {
    await prisma.premium.create({
      data: {
        users: { connect: { id: user.id } },
        admins: { connect: { id: user.id } },
        adminGrantExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10),
        adminGrantTier: PremiumTier.PROFESSIONAL_ANNUALLY,
        tier: PremiumTier.PROFESSIONAL_ANNUALLY,
      },
    });
    console.log("Created premium grant for bridge user");
  }

  console.log(`Bridge user ready: ${user.email} (${user.id})`);

  if (!accountEmail) {
    console.log(
      "No mailbox email provided. Register accounts from the Thunderbird add-on, or re-run with an email:",
    );
    console.log(
      "  pnpm exec dotenv -e .env.local -- tsx scripts/setup-thunderbird-bridge.ts you@example.com",
    );
    return;
  }

  const existingAccount = await prisma.emailAccount.findUnique({
    where: { email: accountEmail },
    include: { account: true, rules: { select: { id: true, name: true } } },
  });

  if (existingAccount) {
    console.log(
      `Email account already exists: ${existingAccount.email} (${existingAccount.id}), provider=${existingAccount.account.provider}`,
    );
    if (owner && existingAccount.userId !== owner.id) {
      await prisma.account.update({
        where: { id: existingAccount.accountId },
        data: { userId: owner.id },
      });
      await prisma.emailAccount.update({
        where: { id: existingAccount.id },
        data: { userId: owner.id },
      });
      console.log(`Reassigned mailbox ownership to ${owner.email}`);
    }
    if (existingAccount.rules.length === 0) {
      await createStarterRules(existingAccount.id);
      console.log("Created starter rules for existing account");
    } else {
      await ensureTriageRules(existingAccount.id, existingAccount.rules);
    }
    return;
  }

  const account = await prisma.account.create({
    data: {
      userId: ownerUserId,
      provider: "thunderbird",
      type: "credentials",
      providerAccountId: `manual-${accountEmail}`,
      access_token: "thunderbird-local",
    },
  });

  const emailAccount = await prisma.emailAccount.create({
    data: {
      email: accountEmail,
      name: accountEmail,
      userId: ownerUserId,
      accountId: account.id,
    },
  });

  await createStarterRules(emailAccount.id);

  console.log(`Created Thunderbird email account: ${emailAccount.email}`);
  console.log(`emailAccountId=${emailAccount.id}`);
  console.log("Starter rules: draft replies + archive newsletters");
}

async function createStarterRules(emailAccountId: string) {
  const draftRule = await prisma.rule.create({
    data: {
      name: "Thunderbird — Draft replies",
      instructions:
        "Draft a short reply only when a real person is waiting on a personal response from me (questions, scheduling, introductions, follow-ups). Do not draft replies for receipts, invoices, order confirmations, shipping updates, payment notices, password resets, account alerts, newsletters, marketing, or other automated transactional mail.",
      // Off by default — small local models over-fire drafts on invoices/receipts.
      enabled: false,
      automate: true,
      emailAccountId,
    },
  });

  await prisma.action.create({
    data: {
      type: ActionType.DRAFT_EMAIL,
      ruleId: draftRule.id,
      emailAccountId,
    },
  });

  const newsletterRule = await prisma.rule.create({
    data: {
      name: "Thunderbird — Archive newsletters",
      instructions:
        "Archive and tag newsletters, marketing digests, and promotional mass mail that do not need a reply. Prefer archive over delete.",
      enabled: true,
      automate: true,
      emailAccountId,
    },
  });

  await prisma.action.createMany({
    data: [
      {
        type: ActionType.ARCHIVE,
        ruleId: newsletterRule.id,
        emailAccountId,
      },
      {
        type: ActionType.LABEL,
        label: "newsletter",
        ruleId: newsletterRule.id,
        emailAccountId,
      },
      {
        type: ActionType.MARK_READ,
        ruleId: newsletterRule.id,
        emailAccountId,
      },
    ],
  });

  const receiptRule = await prisma.rule.create({
    data: {
      name: "Thunderbird — Archive receipts",
      instructions:
        "Archive and tag receipts, invoices for completed purchases, shipping notices, and routine payment confirmations that do not need a reply. Prefer archive over delete so I can search them later.",
      enabled: true,
      automate: true,
      emailAccountId,
    },
  });

  await prisma.action.createMany({
    data: [
      {
        type: ActionType.ARCHIVE,
        ruleId: receiptRule.id,
        emailAccountId,
      },
      {
        type: ActionType.LABEL,
        label: "receipt",
        ruleId: receiptRule.id,
        emailAccountId,
      },
      {
        type: ActionType.MARK_READ,
        ruleId: receiptRule.id,
        emailAccountId,
      },
    ],
  });

  const junkRule = await prisma.rule.create({
    data: {
      name: "Thunderbird — Trash junk",
      instructions:
        "Move obvious junk, phishing, and scam mail to trash. Do not trash receipts, invoices, shipping updates, or anything that looks like a real purchase or account notice.",
      enabled: true,
      automate: true,
      emailAccountId,
    },
  });

  await prisma.action.create({
    data: {
      type: ActionType.DELETE,
      ruleId: junkRule.id,
      emailAccountId,
    },
  });

  const attentionRule = await prisma.rule.create({
    data: {
      name: "Thunderbird — Needs attention",
      instructions:
        "When a real person needs something from me (a question, scheduling, decision, or follow-up) but a drafted reply is not required yet, label the message so I can find it. Skip newsletters, receipts, and automated mail.",
      enabled: true,
      automate: true,
      emailAccountId,
    },
  });

  await prisma.action.create({
    data: {
      type: ActionType.LABEL,
      label: "needs-attention",
      ruleId: attentionRule.id,
      emailAccountId,
    },
  });
}

async function ensureTriageRules(
  emailAccountId: string,
  existingRules: { id: string; name: string }[],
) {
  const names = new Set(existingRules.map((rule) => rule.name));

  const oldArchive = existingRules.find(
    (rule) => rule.name === "Thunderbird — Archive low-priority mail",
  );
  if (oldArchive) {
    await prisma.rule.update({
      where: { id: oldArchive.id },
      data: {
        name: "Thunderbird — Archive newsletters",
        instructions:
          "Archive and tag newsletters, marketing digests, and promotional mass mail that do not need a reply. Prefer archive over delete.",
      },
    });
    names.delete(oldArchive.name);
    names.add("Thunderbird — Archive newsletters");
    console.log("Renamed Archive low-priority → Archive newsletters");
  }

  if (!names.has("Thunderbird — Archive receipts")) {
    const receiptRule = await prisma.rule.create({
      data: {
        name: "Thunderbird — Archive receipts",
        instructions:
          "Archive and tag receipts, invoices for completed purchases, shipping notices, and routine payment confirmations that do not need a reply. Prefer archive over delete so I can search them later.",
        enabled: true,
        automate: true,
        emailAccountId,
      },
    });
    await prisma.action.createMany({
      data: [
        {
          type: ActionType.ARCHIVE,
          ruleId: receiptRule.id,
          emailAccountId,
        },
        {
          type: ActionType.LABEL,
          label: "receipt",
          ruleId: receiptRule.id,
          emailAccountId,
        },
        {
          type: ActionType.MARK_READ,
          ruleId: receiptRule.id,
          emailAccountId,
        },
      ],
    });
    console.log("Added Archive receipts rule");
  }

  if (!names.has("Thunderbird — Trash junk")) {
    const junkRule = await prisma.rule.create({
      data: {
        name: "Thunderbird — Trash junk",
        instructions:
          "Move obvious junk, phishing, and scam mail to trash. Do not trash receipts, invoices, shipping updates, or anything that looks like a real purchase or account notice.",
        enabled: true,
        automate: true,
        emailAccountId,
      },
    });
    await prisma.action.create({
      data: {
        type: ActionType.DELETE,
        ruleId: junkRule.id,
        emailAccountId,
      },
    });
    console.log("Added Trash junk rule");
  }

  if (!names.has("Thunderbird — Needs attention")) {
    const attentionRule = await prisma.rule.create({
      data: {
        name: "Thunderbird — Needs attention",
        instructions:
          "When a real person needs something from me (a question, scheduling, decision, or follow-up) but a drafted reply is not required yet, label the message so I can find it. Skip newsletters, receipts, and automated mail.",
        enabled: true,
        automate: true,
        emailAccountId,
      },
    });
    await prisma.action.create({
      data: {
        type: ActionType.LABEL,
        label: "needs-attention",
        ruleId: attentionRule.id,
        emailAccountId,
      },
    });
    console.log("Added Needs attention rule");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
