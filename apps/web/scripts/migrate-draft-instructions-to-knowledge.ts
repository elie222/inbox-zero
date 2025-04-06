import { ActionType, PrismaClient } from "@prisma/client";

// Run with: `tsx scripts/migrate-draft-instructions-to-knowledge.ts`

const prisma = new PrismaClient();

async function main() {
  console.log(
    "Starting migration to deprecate draftReplies and draftRepliesInstructions fields",
  );

  // Find all rules with draftReplies = true
  const rulesWithDraftReplies = await prisma.rule.findMany({
    where: {
      draftReplies: true,
    },
    select: {
      id: true,
      name: true,
      userId: true,
      draftRepliesInstructions: true,
      actions: true,
    },
  });

  console.log(
    `Found ${rulesWithDraftReplies.length} rules with draftReplies = true`,
  );

  // Process each rule
  for (const rule of rulesWithDraftReplies) {
    console.log(`Processing rule: ${rule.id} - ${rule.name}`);

    // Check if the rule already has a DRAFT_EMAIL action
    const hasDraftAction = rule.actions.some(
      (action) => action.type === ActionType.DRAFT_EMAIL,
    );

    // If no draft action exists, create one
    if (!hasDraftAction) {
      console.log(`Creating DRAFT_EMAIL action for rule: ${rule.id}`);
      await prisma.action.create({
        data: {
          type: ActionType.DRAFT_EMAIL,
          ruleId: rule.id,
        },
      });
    } else {
      console.log(`Rule ${rule.id} already has a DRAFT_EMAIL action`);
    }

    // If the rule has draftRepliesInstructions, create a Knowledge entry
    if (rule.draftRepliesInstructions) {
      console.log(`Creating Knowledge entry for rule: ${rule.id}`);
      // Create a unique title based on the rule name
      const title = "How to draft replies";

      await prisma.knowledge.upsert({
        where: {
          userId_title: {
            userId: rule.userId,
            title,
          },
        },
        update: {},
        create: {
          title,
          content: rule.draftRepliesInstructions,
          userId: rule.userId,
        },
      });
    }
  }

  console.log("Migration complete");
}

main()
  .catch((e) => {
    console.error("Error during migration:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
