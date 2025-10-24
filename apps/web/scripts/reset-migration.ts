import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetMigrationStatus() {
  console.log("Resetting migration status for testing...");

  try {
    // Reset migration status
    await prisma.emailAccount.updateMany({
      data: { digestMigrationCompleted: false },
    });

    // Remove digest actions from To Reply rule
    const toReplyRules = await prisma.rule.findMany({
      where: { systemType: "TO_REPLY" },
      include: { actions: true },
    });

    for (const rule of toReplyRules) {
      await prisma.action.deleteMany({
        where: {
          ruleId: rule.id,
          type: "DIGEST",
        },
      });
    }

    console.log("Migration status reset successfully");
    console.log(`Reset ${toReplyRules.length} To Reply rules`);
  } catch (error) {
    console.error("Error resetting migration:", error);
  }
}

resetMigrationStatus()
  .then(() => {
    console.log("Reset completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exit(1);
  });
