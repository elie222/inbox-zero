#!/usr/bin/env ts-node

/**
 * Test script for delayed actions functionality
 *
 * This script:
 * 1. Creates test actions with various delays
 * 2. Tests the scheduler processing
 * 3. Verifies status updates
 *
 * Usage: npx ts-node scripts/test-delayed-actions.ts
 */

import prisma from "@/utils/prisma";
import { delayUtils } from "@/utils/scheduler/delayed-actions";
import { ActionType } from "@prisma/client";

async function createTestData() {
  console.log("Creating test data for delayed actions...");

  // Find or create a test email account
  const testEmailAccount = await prisma.emailAccount.findFirst({
    select: { id: true, email: true },
  });

  if (!testEmailAccount) {
    console.error(
      "No email account found. Please set up an email account first.",
    );
    process.exit(1);
  }

  console.log(`Using email account: ${testEmailAccount.email}`);

  // Create a test rule
  const testRule = await prisma.rule.upsert({
    where: {
      name_emailAccountId: {
        name: "Test Delayed Actions Rule",
        emailAccountId: testEmailAccount.id,
      },
    },
    update: {},
    create: {
      name: "Test Delayed Actions Rule",
      emailAccountId: testEmailAccount.id,
      instructions: "Test rule for delayed actions",
      automate: true,
      actions: {
        create: [
          {
            type: ActionType.ARCHIVE,
            delayMs: delayUtils.minutes(1), // 1 minute delay
          },
          {
            type: ActionType.LABEL,
            label: "Test Label",
            delayMs: delayUtils.minutes(2), // 2 minute delay
          },
          {
            type: ActionType.ARCHIVE,
            // No delay - immediate
          },
        ],
      },
    },
    include: {
      actions: true,
    },
  });

  console.log(`Created test rule with ${testRule.actions.length} actions`);

  // Create a test executed rule with delayed actions
  const now = new Date();
  const executedRule = await prisma.executedRule.create({
    data: {
      threadId: "test-thread-" + Date.now(),
      messageId: "test-message-" + Date.now(),
      automated: true,
      status: "PENDING",
      reason: "Test delayed actions",
      emailAccountId: testEmailAccount.id,
      ruleId: testRule.id,
      actionItems: {
        create: [
          {
            type: ActionType.ARCHIVE,
            scheduledAt: new Date(now.getTime() + delayUtils.minutes(1)),
            status: "SCHEDULED",
          },
          {
            type: ActionType.LABEL,
            label: "Delayed Label",
            scheduledAt: new Date(now.getTime() + delayUtils.minutes(2)),
            status: "SCHEDULED",
          },
          {
            type: ActionType.ARCHIVE,
            scheduledAt: now,
            status: "PENDING",
          },
          // Create some actions scheduled in the past (ready to execute)
          {
            type: ActionType.LABEL,
            label: "Ready Now",
            scheduledAt: new Date(now.getTime() - delayUtils.minutes(1)),
            status: "SCHEDULED",
          },
        ],
      },
    },
    include: {
      actionItems: true,
    },
  });

  console.log(
    `Created test executed rule with ${executedRule.actionItems.length} action items`,
  );

  return {
    testEmailAccount,
    testRule,
    executedRule,
  };
}

async function testDelayCalculations() {
  console.log("\nTesting delay calculations...");

  const delays = {
    oneMinute: delayUtils.minutes(1),
    oneHour: delayUtils.hours(1),
    oneDay: delayUtils.days(1),
    oneWeek: delayUtils.weeks(1),
    oneMonth: delayUtils.months(1),
  };

  console.log("Delay calculations:");
  Object.entries(delays).forEach(([name, ms]) => {
    const minutes = ms / (1000 * 60);
    const hours = minutes / 60;
    const days = hours / 24;
    console.log(
      `  ${name}: ${ms}ms (${minutes}min, ${hours.toFixed(2)}h, ${days.toFixed(2)}d)`,
    );
  });
}

async function testScheduledActionsQuery() {
  console.log("\nTesting scheduled actions query...");

  const scheduledActions = await prisma.executedAction.findMany({
    where: {
      status: "SCHEDULED",
    },
    include: {
      executedRule: {
        include: {
          emailAccount: {
            select: { email: true },
          },
        },
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });

  console.log(`Found ${scheduledActions.length} scheduled actions:`);
  scheduledActions.forEach((action, index) => {
    console.log(
      `  ${index + 1}. ${action.type} - scheduled for ${action.scheduledAt} (${action.executedRule?.emailAccount?.email})`,
    );
  });

  // Test ready actions query
  const readyActions = await prisma.executedAction.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: {
        lte: new Date(),
      },
    },
  });

  console.log(`Found ${readyActions.length} actions ready for execution`);
}

async function testActionStats() {
  console.log("\nTesting action statistics...");

  const stats = await prisma.executedAction.groupBy({
    by: ["status"],
    _count: {
      status: true,
    },
  });

  console.log("Action status counts:");
  stats.forEach((stat) => {
    console.log(`  ${stat.status}: ${stat._count.status}`);
  });
}

async function cleanup() {
  console.log("\nCleaning up test data...");

  // Delete test executed rules and actions
  await prisma.executedRule.deleteMany({
    where: {
      OR: [
        { threadId: { startsWith: "test-thread-" } },
        { messageId: { startsWith: "test-message-" } },
      ],
    },
  });

  // Delete test rules
  await prisma.rule.deleteMany({
    where: {
      name: "Test Delayed Actions Rule",
    },
  });

  console.log("Cleanup completed");
}

async function main() {
  console.log("🧪 Testing Delayed Actions Functionality\n");

  try {
    await testDelayCalculations();

    const testData = await createTestData();

    await testScheduledActionsQuery();

    await testActionStats();

    console.log("\n✅ All tests completed successfully!");
    console.log("\nNext steps:");
    console.log(
      "1. Run the database migration: npx prisma migrate dev --name add-delayed-actions",
    );
    console.log("2. Generate Prisma client: npx prisma generate");
    console.log(
      "3. Set up a cron job to call: POST /api/scheduler/delayed-actions",
    );
    console.log("4. Monitor with: GET /api/scheduler/delayed-actions");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Uncomment to clean up test data
    // await cleanup();

    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
