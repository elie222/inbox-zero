// Run with: `npx tsx scripts/addUsersToResend.ts`. Make sure to set ENV vars

import { createContact } from "@inboxzero/resend";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
