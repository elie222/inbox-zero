import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { composeAutocompleteBody } from "@/app/api/ai/compose-autocomplete/validation";
import { chatCompletionStream } from "@/utils/llms";

export const POST = withError(async (request: Request): Promise<Response> => {
  const session = await auth();
  const userEmail = session?.user.email;
  if (!userEmail) return NextResponse.json({ error: "Not authenticated" });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const { prompt } = composeAutocompleteBody.parse(json);

  const system = `You are an AI writing assistant that continues existing text based on context from prior text.
Give more weight/priority to the later characters than the beginning ones.
Limit your response to no more than 200 characters, but make sure to construct complete sentences.`;

  const response = await chatCompletionStream({
    userAi: user,
    system,
    prompt,
    userEmail,
    usageLabel: "Compose auto complete",
  });

  return response.toTextStreamResponse();
});
