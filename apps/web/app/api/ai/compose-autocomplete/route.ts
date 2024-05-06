import { StreamingTextResponse } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { composeAutocompleteBody } from "@/app/api/ai/compose-autocomplete/validation";
import { saveAiUsageStream } from "@/utils/usage";
import { chatCompletionStream, getAiProviderAndModel } from "@/utils/llms";

export const POST = withError(async (request: Request): Promise<Response> => {
  const session = await auth();
  const userEmail = session?.user.email;
  if (!userEmail) return NextResponse.json({ error: "Not authenticated" });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const json = await request.json();
  const { prompt } = composeAutocompleteBody.parse(json);

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  const messages = [
    {
      role: "system" as const,
      content:
        "You are an AI writing assistant that continues existing text based on context from prior text. " +
        "Give more weight/priority to the later characters than the beginning ones. " +
        "Limit your response to no more than 200 characters, but make sure to construct complete sentences.",
    },
    {
      role: "user" as const,
      content: prompt,
    },
  ];

  const response = await chatCompletionStream(
    provider,
    model,
    user.openAIApiKey,
    messages,
  );

  const stream = await saveAiUsageStream({
    response,
    provider,
    model,
    userEmail,
    messages,
    label: "Compose auto complete",
  });

  return new StreamingTextResponse(stream);
});
