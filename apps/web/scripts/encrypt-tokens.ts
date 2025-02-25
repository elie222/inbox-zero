import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encryptToken } from "@/utils/encryption";

// Run with: `tsx scripts/encrypt-tokens.ts`

// Create a raw Prisma client without the encryption extension
// to avoid double encryption
const prisma = new PrismaClient();

async function main() {
  console.log("Starting token encryption...");

  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
    },
    where: {
      provider: "google",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  console.log(`Found ${accounts.length} Google accounts to process`);

  let updated = 0;
  let skipped = 0;

  for (const account of accounts) {
    try {
      // Check if tokens are in their original unencrypted format
      const hasUnencryptedAccessToken = isUnencryptedGoogleToken(
        account.access_token,
        "access",
      );
      const hasUnencryptedRefreshToken = isUnencryptedGoogleToken(
        account.refresh_token,
        "refresh",
      );

      // If no unencrypted tokens found, skip this account
      if (!hasUnencryptedAccessToken && !hasUnencryptedRefreshToken) {
        skipped++;
        continue;
      }

      // Only encrypt tokens that are in their original format
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: hasUnencryptedAccessToken
            ? encryptToken(account.access_token)
            : account.access_token,
          refresh_token: hasUnencryptedRefreshToken
            ? encryptToken(account.refresh_token)
            : account.refresh_token,
        },
      });

      updated++;

      if (updated % 100 === 0) {
        console.log(`Processed ${updated} accounts...`);
      }
    } catch (error) {
      console.error(`Error processing account ${account.id}:`, error);
    }
  }

  console.log(`
Encryption complete:
- Total accounts: ${accounts.length}
- Updated: ${updated}
- Skipped (already encrypted): ${skipped}
- Failed: ${accounts.length - updated - skipped}
`);
}

main()
  .catch((error) => {
    console.error("Error in encryption script:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function isUnencryptedGoogleToken(
  token: string | null,
  type: "access" | "refresh",
): boolean {
  if (!token) return false;

  // Google OAuth tokens have specific prefixes
  return type === "access"
    ? token.startsWith("ya29.")
    : token.startsWith("1//");
}
