import type { scim } from "@better-auth/scim";
import { APIError } from "better-auth";
import { env } from "@/env";
import prisma from "@/utils/prisma";

export function getScimOptions(): Parameters<typeof scim>[0] {
  return {
    connections: [],
    ...(env.SCIM_CREDENTIAL_HASH_SECRET && {
      managedConnections: {
        credentialHashSecret: env.SCIM_CREDENTIAL_HASH_SECRET,
      },
    }),
    identity: {
      async resolveUser({ connectionId, resource }) {
        if (!resource.externalId) return { action: "create" };
        const link = await prisma.scimIdentityLink.findUnique({
          where: {
            connectionId_externalId: {
              connectionId,
              externalId: resource.externalId,
            },
          },
          select: { userId: true },
        });
        return link
          ? { action: "link", userId: link.userId, profile: "preserve" }
          : { action: "create" };
      },
      async reconcileUser({ userId, active }, { database }) {
        await database.update({
          model: "user",
          where: [{ field: "id", value: userId }],
          update: { scimAccessDisabled: !active },
        });
        if (!active)
          await database.deleteMany({
            model: "session",
            where: [{ field: "userId", value: userId }],
          });
      },
    },
  };
}

export async function assertScimUserActive(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scimAccessDisabled: true },
  });
  if (user?.scimAccessDisabled)
    throw new APIError("FORBIDDEN", {
      message: "Account access was disabled by your organization",
    });
}
