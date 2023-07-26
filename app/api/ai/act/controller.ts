import { z } from "zod";
import { type ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import { gmail_v1 } from "googleapis";
import { openai } from "@/utils/openai";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { actionFunctions, runActionFunction } from "@/utils/ai/actions";

export const actBody = z.object({
  from: z.string(),
  replyTo: z.string().optional(),
  cc: z.string().optional(),
  subject: z.string(),
  message: z.string(),
  // labels: z.string().array(),
});
export type ActBody = z.infer<typeof actBody>;
export type ActResponse = Awaited<ReturnType<typeof act>>;

// steps:
// 1. read user rules - hardcode an example for now
// 2. ai chooses appropriate function to execute
// 3. execute the function

const RULES = [
  { rule: "Forward all receipts to jamessmith+receipts@gmail.com" },
  {
    rule: 'If the user asks if the new season is live then respond with the following snippet: "Yes, the new season is live. You can sign up to play here: https://draftfantasy.com/"',
  },
  {
    rule: 'If the user asks about not seeing his team in the dashboard then respond with the following snippet: "If you do not see your team you have signed up with a different account."',
  },
];

export async function act(
  body: ActBody,
  gmail: gmail_v1.Gmail
): Promise<{ action: string } | undefined> {
  const aiResponse = await openai.createChatCompletion({
    model: "gpt-4", // gpt-3.5-turbo is not good at this
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that helps people manage their emails. You don't make decisions without asking for more information.
        
These are the rules to follow.:
${RULES.map((r, i) => `${i + 1}. ${r.rule}`).join("\n\n")}`,
      },
      {
        role: "user",
        content: `From: ${body.from}
Reply to: ${body.replyTo}
CC: ${body.cc}
Subject: ${body.subject}
Email:
${body.message}`,
      },
    ],
    functions: actionFunctions,
    function_call: "auto",
  });

  const json: ChatCompletionResponse | ChatCompletionError =
    await aiResponse.json();

  if (isChatCompletionError(json)) {
    console.error(json);
    return;
  }

  // console.log("🚀 ~ file: controller.ts:64 ~ act ~ json:", JSON.stringify(json.choices, null, 2))

  const functionCall = json?.choices?.[0]?.message.function_call as
    | ChatCompletionRequestMessageFunctionCall
    | undefined;

  if (!functionCall?.name) return;

  console.log("functionCall:", functionCall);

  // await runActionFunction(
  //   gmail,
  //   functionCall.name,
  //   functionCall.arguments ? JSON.parse(functionCall.arguments) : undefined
  // );

  return { action: functionCall.name || "" };
}
