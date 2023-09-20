import "server-only";
import { z } from "zod";
import { parseJSON } from "@/utils/json";
import { AIModel, UserAIFields, getOpenAI } from "@/utils/openai";
import { DEFAULT_AI_MODEL, generalPrompt } from "@/utils/config";
import { getPlan, planSchema, savePlan } from "@/utils/redis/plan";
import { saveUsage } from "@/utils/redis/usage";
import { getUserLabels } from "@/utils/label";
import { ActionType } from "@prisma/client";

export const planBody = z.object({
  id: z.string(),
  subject: z.string(),
  message: z.string(),
  replan: z.boolean(),
  senderEmail: z.string(),
});
export type PlanBody = z.infer<typeof planBody>;
export type PlanResponse = Awaited<ReturnType<typeof plan>>;

async function calculatePlan(
  subject: string,
  message: string,
  senderEmail: string,
  labels: { name?: string; description?: string | null }[],
  userAIFields: UserAIFields
) {
  const systemMessage = `You are an AI assistant that helps people manage their emails by replying, archiving and labelling emails on the user's behalf.
It is your job to plan a course of action for emails.
You will always return valid JSON as a response.

The JSON should contain the following fields:
  
action: ${Object.keys(ActionType).join(", ")}
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
  
If action is "reply", include a "response" field with a response to send.
If action is "label", include a "label" field with the label from the list of labels above.
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.
`;

  const model = userAIFields.aiModel || DEFAULT_AI_MODEL;
  const aiResponse = await getOpenAI(
    userAIFields.openAIApiKey
  ).chat.completions.create({
    model,
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
        content: `The email:
Subject: ${subject}
From: ${senderEmail}
Body:
${message.substring(0, 3000)}
        `,
      },
    ],
  });

  return aiResponse;
}

export async function plan(
  body: PlanBody,
  user: { id: string; email: string } & UserAIFields
) {
  // check cache
  const data = body.replan
    ? undefined
    : await getPlan({ userId: user.id, threadId: body.id });
  if (data) return { plan: data };

  const labels = await getUserLabels({ email: user.email });

  let aiResponse = await calculatePlan(
    body.subject,
    body.message,
    body.senderEmail,
    labels || [],
    user
  );

  // if (isChatCompletionError(json)) return { plan: undefined };

  const planString = aiResponse.choices?.[0]?.message?.content;

  if (!planString) {
    console.error("plan string undefined");
    console.error("length", body.message.length);
    console.error("aiResponse", aiResponse);
  }

  const planJson = planSchema.parse(parseJSON(planString!));

  // cache result
  await savePlan({
    userId: user.id,
    threadId: body.id,
    plan: planJson,
  });

  if (aiResponse.usage)
    await saveUsage({
      email: user.email,
      usage: aiResponse.usage,
      model: aiResponse.model as AIModel,
    });

  return { plan: planJson };
}
