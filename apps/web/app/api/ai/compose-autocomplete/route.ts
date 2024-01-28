import { OpenAIStream, StreamingTextResponse } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { DEFAULT_AI_MODEL, getOpenAI } from "@/utils/openai";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { composeAutocompleteBody } from "@/app/api/ai/compose-autocomplete/validation";

export const POST = withError(async (request: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const json = await request.json();
  const { prompt } = composeAutocompleteBody.parse(json);

  const openAiClient = getOpenAI(user.openAIApiKey);

  const response = await openAiClient.chat.completions.create({
    model: user.aiModel || DEFAULT_AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an AI writing assistant that continues existing text based on context from prior text. " +
          "Give more weight/priority to the later characters than the beginning ones. " +
          "Limit your response to no more than 200 characters, but make sure to construct complete sentences.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    stream: true,
    n: 1,
  });

  const stream = OpenAIStream(response);

  return new StreamingTextResponse(stream);
});
