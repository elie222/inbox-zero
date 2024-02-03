import { OpenAIStream, StreamingTextResponse } from "ai";
import { NextResponse } from "next/server";
import { encoding_for_model } from "tiktoken";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { AIModel, DEFAULT_AI_MODEL, getOpenAI } from "@/utils/openai";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { composeAutocompleteBody } from "@/app/api/ai/compose-autocomplete/validation";
import { saveAiUsage } from "@/utils/usage";

export const POST = withError(async (request: Request): Promise<Response> => {
  const session = await auth();
  const userEmail = session?.user.email;
  if (!userEmail) return NextResponse.json({ error: "Not authenticated" });

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

  const model = (user.aiModel as AIModel | undefined) || DEFAULT_AI_MODEL;

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

  const response = await openAiClient.chat.completions.create({
    model,
    messages,
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    stream: true,
    n: 1,
  });

  const enc = encoding_for_model(model);
  let completionTokens = 0;

  // to count token usage:
  // https://www.linkedin.com/pulse/token-usage-openai-streams-peter-marton-7bgpc/
  const stream = OpenAIStream(response, {
    onToken: (content) => {
      // We call encode for every message as some experienced
      // regression when tiktoken called with the full completion
      const tokenList = enc.encode(content);
      completionTokens += tokenList.length;
    },
    async onFinal() {
      const promptTokens = messages.reduce(
        (total, msg) => total + enc.encode(msg.content ?? "").length,
        0,
      );

      await saveAiUsage({
        email: userEmail,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        model,
        label: "Compose auto complete",
      });
    },
  });

  return new StreamingTextResponse(stream);
});
