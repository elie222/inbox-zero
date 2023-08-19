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

const classifyThreadBody = z.object({
  subject: z.string(),
  content: z.string(),
});
export type ClassifyThreadBody = z.infer<typeof classifyThreadBody>;
export type ClassifyThreadResponse = Awaited<ReturnType<typeof classify>>;

export const runtime = "edge";

async function classify(body: ClassifyThreadBody) {
  const response = await openai.createChatCompletion({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: "You are an assistant that helps categorise emails.",
      },
      {
        role: "user",
        content: `Please categorise this email.
Return a JSON object with a "category" and "confidence" fields. Confidence is a number between 0 and 1.

Categories to choose from with an explanation of each category:
NEWSLETTER - newsletters
MARKETING - marketing emails
RECEIPT - a receipt or invoice for payments I've made
EVENT - calendar or event invites
TRAVEL - travel itineraries and confirmations
QUESTION - someone asks me a question
COLD_EMAIL - someone I don't know emails me to sell me something
SOCIAL_MEDIA - notifications from social media
LEGAL_UPDATE - updates about changes to terms of service or privacy policy
OTHER - anything else

An example response would be:
{
  "category": "NEWSLETTER",
  "confidence": 0.8
}

##
Email:

Subject: ${body.subject}

Body: ${body.content}`,
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
