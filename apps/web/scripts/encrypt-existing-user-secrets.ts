// Run with: `npx tsx scripts/encrypt-existing-user-secrets.ts`
// Make sure to set EMAIL_ENCRYPT_SECRET and EMAIL_ENCRYPT_SALT env vars
//
// This script encrypts existing plaintext aiApiKey and webhookSecret values.
// It's safe to run multiple times - already encrypted values are skipped.
//
// NOTE: Legacy format detection (64+ hex chars) may false-positive on plaintext.
// Values with `enc:` prefix are reliably detected as encrypted.
// Run this script after deployment to encrypt any remaining plaintext values.

import { PrismaClient } from "@/generated/prisma/client";
import { encryptToken } from "@/utils/encryption";

const prisma = new PrismaClient();

const ENCRYPTION_PREFIX = "enc:";
const MIN_ENCRYPTED_HEX_LENGTH = 64;
const BATCH_SIZE = 100;

function isEncryptedFormat(text: string): boolean {
  // New format with prefix - reliable detection
  if (text.startsWith(ENCRYPTION_PREFIX)) {
    return true;
  }
  // Legacy format check
  if (text.length < MIN_ENCRYPTED_HEX_LENGTH) return false;
  return /^[0-9a-f]+$/i.test(text);
}

async function main() {
  console.log("Starting encryption migration for User secrets...\n");

  let offset = 0;
  let totalProcessed = 0;
  let aiApiKeyEncrypted = 0;
  let webhookSecretEncrypted = 0;
  let skipped = 0;
  let encryptionFailures = 0;

  while (true) {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ aiApiKey: { not: null } }, { webhookSecret: { not: null } }],
      },
      select: {
        id: true,
        aiApiKey: true,
        webhookSecret: true,
      },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (users.length === 0) break;

    for (const user of users) {
      const updates: { aiApiKey?: string; webhookSecret?: string } = {};

      if (user.aiApiKey && !isEncryptedFormat(user.aiApiKey)) {
        const encrypted = encryptToken(user.aiApiKey);
        if (encrypted) {
          updates.aiApiKey = encrypted;
          aiApiKeyEncrypted++;
        } else {
          console.error(`Failed to encrypt aiApiKey for user ${user.id}`);
          encryptionFailures++;
        }
      } else if (user.aiApiKey) {
        skipped++;
      }

      if (user.webhookSecret && !isEncryptedFormat(user.webhookSecret)) {
        const encrypted = encryptToken(user.webhookSecret);
        if (encrypted) {
          updates.webhookSecret = encrypted;
          webhookSecretEncrypted++;
        } else {
          console.error(`Failed to encrypt webhookSecret for user ${user.id}`);
          encryptionFailures++;
        }
      } else if (user.webhookSecret) {
        skipped++;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
        console.log(`Encrypted secrets for user ${user.id}`);
      }

      totalProcessed++;
    }

    offset += BATCH_SIZE;
    console.log(`Processed ${totalProcessed} users...`);
  }

  console.log("\n--- Migration Complete ---");
  console.log(`Total users processed: ${totalProcessed}`);
  console.log(`aiApiKey values encrypted: ${aiApiKeyEncrypted}`);
  console.log(`webhookSecret values encrypted: ${webhookSecretEncrypted}`);
  console.log(`Already encrypted (skipped): ${skipped}`);
  console.log(`Encryption failures: ${encryptionFailures}`);

  if (encryptionFailures > 0) {
    console.error(
      `\nWARNING: ${encryptionFailures} encryption failures occurred. Check logs above for details.`,
    );
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
