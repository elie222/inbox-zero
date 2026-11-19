import { NextResponse } from "next/server";
import { getSignatureSuggestions } from "@/utils/email/signature-suggestions";
import { withEmailAccount } from "@/utils/middleware";

export type GetSignatureSuggestionsResponse = Awaited<
  ReturnType<typeof getSignatureSuggestions>
>;

export const GET = withEmailAccount(
  "user/signature-suggestions",
  async (request) => {
    const result = await getSignatureSuggestions({
      emailAccountId: request.auth.emailAccountId,
      logger: request.logger,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
