import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { aiFindExampleMatches } from "@/utils/ai/example-matches/find-example-matches";
import { rulesExamplesQuery } from "@/app/api/user/rules/examples/validation";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { getGmailClient } from "@/utils/gmail/client";

export type RulesExamplesResponse = Awaited<
  ReturnType<typeof aiFindExampleMatches>
>;

export const GET = withError(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const rulesPrompt = searchParams.get("rulesPrompt");
  const query = rulesExamplesQuery.parse({ rulesPrompt });

  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);

  if (!token.token) return NextResponse.json({ error: "No access token" });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      aiModel: true,
      aiProvider: true,
      aiApiKey: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" });

  const { matches } = await aiFindExampleMatches(
    user,
    gmail,
    token.token,
    query.rulesPrompt,
  );

  return NextResponse.json({ matches });
});
