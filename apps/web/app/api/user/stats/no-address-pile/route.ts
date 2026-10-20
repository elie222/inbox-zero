import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getNoAddressPile } from "@/utils/no-address-pile";

export type NoAddressPileResponse = Awaited<
  ReturnType<typeof getNoAddressPile>
>;

export const GET = withEmailAccount(
  "user/stats/no-address-pile",
  async (request) => {
    const result = await getNoAddressPile({
      emailAccountId: request.auth.emailAccountId,
    });
    return NextResponse.json(result);
  },
);
