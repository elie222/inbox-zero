#!/usr/bin/env tsx

/**
 * Standalone script to fix corrupted tokens from NextAuth to Better-Auth migration
 * Usage: pnpm exec tsx scripts/fix-corrupted-tokens.ts
 */

import { fixCorruptedTokens } from "@/utils/migration/fix-encrypted-tokens";

async function main() {
  console.log("🔧 Starting corrupted token cleanup...");

  try {
    const result = await fixCorruptedTokens();

    console.log("✅ Token cleanup completed successfully!");
    console.log("📊 Results:");
    console.log(`   - Total accounts checked: ${result.total}`);
    console.log(`   - Corrupted tokens fixed: ${result.fixed}`);

    if (result.fixed > 0) {
      console.log(
        "\n⚠️  Users with affected accounts will need to re-authenticate on their next login.",
      );
      console.log(
        "   This will happen automatically - no action required from users.",
      );
    } else {
      console.log("🎉 No corrupted tokens found - all accounts are healthy!");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during token cleanup:", error);
    process.exit(1);
  }
}

main();
