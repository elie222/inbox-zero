import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetAllowedActionsResponse = Awaited<
  ReturnType<typeof getAllowedActions>
>;

export const GET = withEmailAccount(
  "agent/allowed-actions",
  async (request) => {
    const { emailAccountId } = request.auth;
    const result = await getAllowedActions({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getAllowedActions({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
    select: {
      allowedActions: {
        select: {
          id: true,
          actionType: true,
          resourceType: true,
          enabled: true,
        },
        orderBy: { actionType: "asc" },
      },
      allowedActionOptions: {
        select: {
          id: true,
          actionType: true,
          provider: true,
          kind: true,
          externalId: true,
          name: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  return {
    allowedActions: account.allowedActions,
    allowedActionOptions: account.allowedActionOptions,
  };
}
