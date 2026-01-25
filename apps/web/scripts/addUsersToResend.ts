// Run with: `npx tsx scripts/addUsersToResend.ts`. Make sure to set ENV vars

import { PrismaPg } from "@prisma/adapter-pg";
import { createContact } from "@inboxzero/resend";
import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.PREVIEW_DATABASE_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({ select: { email: true } });

  for (const user of users) {
    try {
      if (user.email) {
        console.log("Adding user", user.email);
        const result = await createContact({ email: user.email });
        const error = result && "error" in result ? result.error : undefined;
        if (error) console.error(error);
      }
    } catch (error) {
      console.error("Error creating contact for user: ", user.email, error);
    }
  }
}

main().finally(() => {
  prisma.$disconnect();
});
