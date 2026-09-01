import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { getLemonCustomer } from "@/ee/billing/lemon/index";

type LemonPremium = {
  id: string;
  users: Array<{
    id: string;
    email: string;
    emailAccounts: Array<{ email: string }>;
  }>;
};

export async function connectLemonCustomerAsAdmin({
  customerId,
  premium,
  logger,
}: {
  customerId: number;
  premium: LemonPremium;
  logger: Logger;
}): Promise<boolean> {
  const response = await getLemonCustomer(customerId.toString());
  if (response.error) throw response.error;

  const customerEmail = response.data?.data.attributes.email
    .trim()
    .toLowerCase();
  if (!customerEmail) {
    logger.warn("Cannot establish purchaser from Lemon Squeezy customer", {
      customerId,
      premiumId: premium.id,
      reason: "missing customer email",
    });
    return false;
  }

  const matchingUsers = premium.users.filter((user) => {
    if (user.email.trim().toLowerCase() === customerEmail) return true;
    return user.emailAccounts.some(
      (emailAccount) =>
        emailAccount.email.trim().toLowerCase() === customerEmail,
    );
  });

  if (matchingUsers.length !== 1) {
    logger.warn("Cannot establish purchaser from Lemon Squeezy customer", {
      customerId,
      premiumId: premium.id,
      matchingUserCount: matchingUsers.length,
    });
    return false;
  }

  const purchaserUserId = matchingUsers[0].id;
  await prisma.premium.update({
    where: {
      id: premium.id,
      users: { some: { id: purchaserUserId } },
    },
    data: { admins: { connect: { id: purchaserUserId } } },
  });

  logger.info("Recorded Lemon Squeezy purchaser as premium admin", {
    customerId,
    premiumId: premium.id,
    purchaserUserId,
  });
  return true;
}
