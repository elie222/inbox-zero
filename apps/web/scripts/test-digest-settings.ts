import { PrismaClient, ActionType } from "@prisma/client";

const prisma = new PrismaClient();

async function testDigestSettingsAPI() {
  console.log("Testing digest settings API logic...");

  try {
    // Get the email account
    const emailAccount = await prisma.emailAccount.findFirst({
      include: {
        rules: {
          include: {
            actions: true,
          },
        },
      },
    });

    if (!emailAccount) {
      console.log("No email account found");
      return;
    }

    console.log(`\nEmail Account: ${emailAccount.email}`);
    console.log(
      `Migration completed: ${emailAccount.digestMigrationCompleted}`,
    );

    // Test the digest settings logic
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

    console.log("\nRules with digest actions:");
    emailAccount.rules.forEach((rule) => {
      const digestActions = rule.actions.filter(
        (action) => action.type === ActionType.DIGEST,
      );
      if (digestActions.length > 0) {
        console.log(
          `  - ${rule.name} (${rule.systemType}): ${digestActions.length} digest actions`,
        );
        if (rule.systemType && rule.systemType in systemTypeToKey) {
          const key = systemTypeToKey[rule.systemType];
          digestSettings[key] = true;
        }
      }
    });

    console.log("\nFinal digest settings:");
    console.log(JSON.stringify(digestSettings, null, 2));

    // Test the rules API logic
    console.log("\nRules API response:");
    const rulesResponse = emailAccount.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      systemType: rule.systemType,
      actions: rule.actions.map((action) => ({ type: action.type })),
    }));
    console.log(JSON.stringify(rulesResponse, null, 2));
  } catch (error) {
    console.error("Error testing digest settings:", error);
  }
}

testDigestSettingsAPI()
  .then(() => {
    console.log("\nTest completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
