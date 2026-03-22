/**
 * Seed script for Chief of Staff pipeline configuration.
 *
 * Usage:
 *   cd apps/web && npx tsx ../../scripts/seed-chief-of-staff.ts
 *
 * Requires DATABASE_URL to be set. Looks up EmailAccount by email address,
 * then upserts ChiefOfStaffConfig and AutonomyLevel records.
 */

import { PrismaClient } from "../apps/web/generated/prisma/client";

const prisma = new PrismaClient();

const AUTONOMY_LEVELS = [
  { category: "scheduling", mode: "auto_handle" },
  { category: "scheduling_cancel", mode: "draft_approve" },
  { category: "client_parent", mode: "draft_approve" },
  { category: "business", mode: "draft_approve" },
  { category: "urgent", mode: "flag_only" },
  { category: "notification", mode: "auto_handle" },
  { category: "low_priority", mode: "auto_handle" },
] as const;

const INBOXES = [
  {
    email: "leekenick@gmail.com",
    venture: "personal" as const,
    voiceTone: {
      instructions: "Direct and casual. Nick's personal voice.",
    },
  },
  {
    email: "nick@smartcollege.com",
    venture: "smart_college" as const,
    voiceTone: {
      instructions:
        "Warm but professional. First-name basis with parents. Reference the student by name.",
    },
  },
];

async function main() {
  for (const inbox of INBOXES) {
    const emailAccount = await prisma.emailAccount.findFirst({
      where: { email: inbox.email },
      select: { id: true, email: true },
    });

    if (!emailAccount) {
      console.log(`⚠️  EmailAccount not found for ${inbox.email} — skipping`);
      continue;
    }

    console.log(
      `✅ Found EmailAccount ${emailAccount.id} for ${emailAccount.email}`,
    );

    // Upsert ChiefOfStaffConfig
    await prisma.chiefOfStaffConfig.upsert({
      where: { emailAccountId: emailAccount.id },
      create: {
        emailAccountId: emailAccount.id,
        venture: inbox.venture,
        voiceTone: inbox.voiceTone,
        enabled: true,
      },
      update: {
        venture: inbox.venture,
        voiceTone: inbox.voiceTone,
        enabled: true,
      },
    });
    console.log(`   → ChiefOfStaffConfig upserted (${inbox.venture})`);

    // Upsert AutonomyLevel records
    for (const level of AUTONOMY_LEVELS) {
      await prisma.autonomyLevel.upsert({
        where: {
          emailAccountId_category: {
            emailAccountId: emailAccount.id,
            category: level.category,
          },
        },
        create: {
          emailAccountId: emailAccount.id,
          category: level.category,
          mode: level.mode,
        },
        update: {
          mode: level.mode,
        },
      });
    }
    console.log("   → 7 AutonomyLevel records upserted");
  }

  console.log("\n🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
