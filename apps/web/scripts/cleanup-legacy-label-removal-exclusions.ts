// Removes sender exclusions learned from a single label removal before
// learning required repeated removals. Exclusions that today's learning rule
// would still create are kept, as is anything a user added or edited.
//
// Dry run (default): `pnpm --filter inbox-zero-ai exec tsx scripts/cleanup-legacy-label-removal-exclusions.ts`
// Apply changes: `pnpm --filter inbox-zero-ai exec tsx scripts/cleanup-legacy-label-removal-exclusions.ts --apply`

import "dotenv/config";
import prisma from "@/utils/prisma";
import {
  cleanupLegacyLabelRemovalExclusions,
  LEGACY_LABEL_REMOVAL_CUTOFF,
} from "@/utils/rule/legacy-label-removal-exclusions";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(
    `${apply ? "Applying" : "Dry run"}: label-removal exclusions created before ${LEGACY_LABEL_REMOVAL_CUTOFF.toISOString()}`,
  );

  const stats = await cleanupLegacyLabelRemovalExclusions({ apply });

  console.table(stats);
  if (!apply) console.log("No changes made. Re-run with --apply to delete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
