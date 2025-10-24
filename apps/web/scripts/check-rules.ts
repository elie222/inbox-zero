import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkRules() {
  console.log("Checking existing rules...");

  try {
    const emailAccounts = await prisma.emailAccount.findMany({
      include: {
        rules: {
          include: {
            actions: true,
          },
        },
      },
    });

    console.log(`Found ${emailAccounts.length} email accounts`);

    for (const account of emailAccounts) {
      console.log(`\nAccount: ${account.email}`);
      console.log(`Migration completed: ${account.digestMigrationCompleted}`);
      console.log(`Rules (${account.rules.length}):`);

      for (const rule of account.rules) {
        console.log(`  - ${rule.name} (${rule.systemType})`);
        console.log(
          `    Actions: ${rule.actions.map((a) => a.type).join(", ")}`,
        );
      }
    }
  } catch (error) {
    console.error("Error checking rules:", error);
  }
}

checkRules()
  .then(() => {
    console.log("\nCheck completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Check failed:", error);
    process.exit(1);
  });
