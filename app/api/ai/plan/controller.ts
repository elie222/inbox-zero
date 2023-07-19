import "server-only";
import { z } from "zod";
import { openai } from "@/app/api/ai/openai";
import { ACTIONS, generalPrompt } from "@/utils/config";
import { getPlan, planSchema, savePlan } from "@/utils/redis/plan";
import { saveUsage } from "@/utils/redis/usage";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { getUserLabels } from "@/utils/label";

export const planBody = z.object({
  id: z.string(),
  subject: z.string(),
  message: z.string(),
});
export type PlanBody = z.infer<typeof planBody>;
export type PlanResponse = Awaited<ReturnType<typeof plan>>;

async function calculatePlan(
  subject: string,
  message: string,
  labels: { name: string; description?: string | null }[]
) {
  const systemMessage = `You are an AI assistant that helps people get to inbox zero quickly by replying, archiving and labelling emails on the user's behalf.
The user will send email messages and it is your job to plan a course of action to handle it.
You will always return valid JSON as a response.

The JSON should contain the following fields:
  
action: ${ACTIONS.join(", ")}
label?: LABEL
response?: string
  
${
  labels.length
    ? `LABEL can be one of the following:
${labels
  .map((l) => `* ${l.name}${l.description ? ` - ${l.description}` : ""}`)
  .join(", \n")}`
    : ""
}
  
If you have decided to respond to the email, you must include a "response" field with the response you want to send.Otherwise the "response" field must be omitted.
If you have decided to label the email, you must include a "label" field with the label.Otherwise the "label" field must be omitted.

Do not use labels that do not exist.
`;

  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: `${generalPrompt}`,
      },
      {
        role: "user",
        content: `
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.

The email: \n\n###\n\n
Subject: ${subject}
Body:
${message.substring(0, 3000)}
        `,
      },
    ],
  });
  const json: ChatCompletionResponse | ChatCompletionError =
    await response.json();

  return json;
}

export async function plan(
  body: PlanBody,
  user: { id: string; email: string }
) {
  // check cache
  const data = await getPlan({ email: user.email, threadId: body.id });
  if (data) return { plan: data };

  const labels = await getUserLabels({ email: user.email });

  let json = await calculatePlan(body.subject, body.message, labels || []);

  if (isChatCompletionError(json)) return { plan: undefined };

  const planString: string = json?.choices?.[0]?.message?.content;

  if (!planString) {
    console.error("plan string undefined");
    console.error("length", body.message.length);
    console.error("json", json);
  }

  const planJson = planSchema.parse(JSON.parse(planString));

  // cache result
  await savePlan({
    email: user.email,
    threadId: body.id,
    plan: planJson,
  });

  await saveUsage({
    email: user.email,
    tokensUsed: json.usage.total_tokens,
  });

  return { plan: planJson };
}
