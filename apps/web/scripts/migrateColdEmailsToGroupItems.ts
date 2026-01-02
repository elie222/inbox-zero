// Run with: `npx tsx scripts/migrateColdEmailsToGroupItems.ts`. Make sure to set ENV vars

import { PrismaClient } from "@/generated/prisma/client";
import {
  SystemType,
  GroupItemType,
  GroupItemSource,
} from "@/generated/prisma/enums";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting migration of ColdEmail records to GroupItem...");

  // 1. Fetch all ColdEmail records using raw query since the model is commented out in Prisma
  // We use double quotes to handle case-sensitivity in Postgres
  let coldEmails: any[] = [];
  try {
    coldEmails = await prisma.$queryRawUnsafe(`SELECT * FROM "ColdEmail"`);
  } catch (error) {
    console.error(
      "Could not find ColdEmail table. It may have already been deleted or renamed.",
    );
    return;
  }

  console.log(`Found ${coldEmails.length} records to migrate.`);

  for (const coldEmail of coldEmails) {
    try {
      const emailAccountId = coldEmail.emailAccountId;

      // 2. Find the Cold Email rule for this account
      const rule = await prisma.rule.findUnique({
        where: {
          emailAccountId_systemType: {
            emailAccountId,
            systemType: SystemType.COLD_EMAIL,
          },
        },
        select: { id: true, groupId: true, name: true },
      });

      if (!rule) {
        console.warn(
          `No Cold Email rule found for account ${emailAccountId}. Skipping sender: ${coldEmail.fromEmail}`,
        );
        continue;
      }

      let groupId = rule.groupId;

      // 3. Create a group if the rule doesn't have one associated yet
      if (!groupId) {
        const newGroup = await prisma.group.create({
          data: {
            emailAccountId,
            name: rule.name,
            rule: { connect: { id: rule.id } },
          },
        });
        groupId = newGroup.id;
        console.log(`Created new group for account ${emailAccountId}`);
      }

      // 4. Map the old status to the new exclude/source system
      const exclude = coldEmail.status === "USER_REJECTED_COLD";
      const source =
        coldEmail.status === "USER_REJECTED_COLD"
          ? GroupItemSource.USER
          : GroupItemSource.AI;

      // 5. Upsert GroupItem to avoid duplicates and preserve context
      await prisma.groupItem.upsert({
        where: {
          groupId_type_value: {
            groupId,
            type: GroupItemType.FROM,
            value: coldEmail.fromEmail,
          },
        },
        update: {
          exclude,
          reason: coldEmail.reason,
          threadId: coldEmail.threadId,
          messageId: coldEmail.messageId,
          source,
          createdAt: coldEmail.createdAt,
          updatedAt: coldEmail.updatedAt,
        },
        create: {
          groupId,
          type: GroupItemType.FROM,
          value: coldEmail.fromEmail,
          exclude,
          reason: coldEmail.reason,
          threadId: coldEmail.threadId,
          messageId: coldEmail.messageId,
          source,
          createdAt: coldEmail.createdAt,
          updatedAt: coldEmail.updatedAt,
        },
      });
    } catch (error) {
      console.error(
        `Error migrating record for ${coldEmail.fromEmail}:`,
        error,
      );
    }
  }

  console.log("Migration finished successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
