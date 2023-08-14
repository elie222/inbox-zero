import { z } from "zod";
import { NextResponse } from "next/server";
import { openai } from "@/utils/openai";
import { AI_MODEL } from "@/utils/config";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { withError } from "@/utils/middleware";

const classifyThreadBody = z.object({ message: z.string() });
export type ClassifyThreadBody = z.infer<typeof classifyThreadBody>;
export type ClassifyThreadResponse = Awaited<ReturnType<typeof classify>>;

export const runtime = "edge";

async function classify(body: ClassifyThreadBody) {
  const response = await openai.createChatCompletion({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          'You are an AI assistant that helps classify emails into different categories. The user will send email messages and it is your job to return the category of the email. Categories to use are: "spam", "promotions", "social", "requires_response", "requires_action", "receipts", "newsletter", "app_update", "terms_and_conditions_update"',
      },
      {
        role: "user",
        content: `Please classify this email using a one-word response:\n\n###\n\n${body.message}`,
      },
    ],
  });
  const json: ChatCompletionResponse | ChatCompletionError =
    await response.json();

  const message = isChatCompletionError(json)
    ? "error"
    : json?.choices?.[0]?.message?.content;

  return { message };
}

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = classifyThreadBody.parse(json);
  const res = await classify(body);

  return NextResponse.json(res);
});
