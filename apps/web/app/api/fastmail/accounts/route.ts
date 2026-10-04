import { withError } from "@/utils/middleware";
import { isValidInternalApiKey } from "@/utils/internal-api";
import prisma from "@/utils/prisma";

export const dynamic = "force-dynamic";
export const GET = withError("fastmail/accounts", async (request) => {
  if (!isValidInternalApiKey(request.headers, request.logger))
    return new Response("Unauthorized", { status: 401 });
  const accounts = await prisma.emailAccount.findMany({
    where: {
      account: {
        provider: "fastmail",
        type: "app_token",
        access_token: { not: null },
      },
    },
    select: { id: true, account: { select: { access_token: true } } },
  });
  return Response.json(
    {
      accounts: accounts.map((account) => ({
        emailAccountId: account.id,
        accessToken: account.account.access_token,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
