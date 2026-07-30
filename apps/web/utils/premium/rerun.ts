import type { PremiumTier } from "@/generated/prisma/enums";

// Shared by the client toggle and the server-side gate in runRulesAction so
// the two can't drift.
export const RERUN_MINIMUM_TIER: PremiumTier = "PROFESSIONAL_MONTHLY";

export const RERUN_UPGRADE_MESSAGE =
  "Re-processing emails you've already handled is available on the Professional plan.";
