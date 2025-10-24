import { PrismaClient, ActionType } from "@prisma/client";

const prisma = new PrismaClient();

async function debugAPIs() {
  console.log("Debugging API responses...");

  try {
    const emailAccountId = "cmh014ypz0005rzie4vf7hoaq";

    // Test rules API
    console.log("\n=== RULES API ===");
    const rules = await prisma.rule.findMany({
      where: { emailAccountId },
      include: {
        actions: true,
        group: { select: { name: true } },
        categoryFilters: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Found ${rules.length} rules:`);
    rules.forEach((rule) => {
      const digestActions = rule.actions.filter(
        (a) => a.type === ActionType.DIGEST,
      );
      console.log(
        `  - ${rule.name} (${rule.systemType}): ${rule.actions.length} actions, ${digestActions.length} digest`,
      );
    });

    // Test digest settings API
    console.log("\n=== DIGEST SETTINGS API ===");
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        coldEmailDigest: true,
        rules: {
          where: {
            systemType: {
              in: [
                "TO_REPLY",
                "NEWSLETTER",
                "MARKETING",
                "CALENDAR",
                "RECEIPT",
                "NOTIFICATION",
              ],
            },
          },
          select: {
            systemType: true,
            actions: {
              where: {
                type: ActionType.DIGEST,
              },
            },
          },
        },
      },
    });

    if (!emailAccount) {
      console.log("Email account not found");
      return;
    }

    const digestSettings = {
      toReply: false,
      newsletter: false,
      marketing: false,
      calendar: false,
      receipt: false,
      notification: false,
      coldEmail: emailAccount.coldEmailDigest || false,
    };

    const systemTypeToKey = {
      TO_REPLY: "toReply",
      NEWSLETTER: "newsletter",
      MARKETING: "marketing",
      CALENDAR: "calendar",
      RECEIPT: "receipt",
      NOTIFICATION: "notification",
    };

    emailAccount.rules.forEach((rule) => {
      if (rule.systemType && rule.systemType in systemTypeToKey) {
        const key = systemTypeToKey[rule.systemType];
        digestSettings[key] = rule.actions.length > 0;
        console.log(
          `  - ${rule.systemType}: ${rule.actions.length} digest actions`,
        );
      }
    });

    console.log("Digest settings:", JSON.stringify(digestSettings, null, 2));
  } catch (error) {
    console.error("Error debugging APIs:", error);
  }
}

debugAPIs()
  .then(() => {
    console.log("\nDebug completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Debug failed:", error);
    process.exit(1);
  });
