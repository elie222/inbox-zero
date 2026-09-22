import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import {
  getUserTier,
  hasTierAccess,
  premiumEntitlementSelect,
} from "@/utils/premium";
import prisma from "@/utils/prisma";

export async function assertIntegrationsTierAccess({
  userId,
  logger,
}: {
  userId: string;
  logger: Logger;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premium: { select: premiumEntitlementSelect } },
  });

  const tier = getUserTier(user?.premium);

  if (hasTierAccess({ tier, minimumTier: "PLUS_MONTHLY" })) return;

  logger.warn("Integration rejected: tier too low", { tier });
  throw new SafeError(
    "Integrations require a Plus plan or higher. Please upgrade to continue.",
  );
}
