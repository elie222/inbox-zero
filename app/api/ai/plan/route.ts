import { z } from "zod";
import { NextResponse } from "next/server";
import { openai } from "@/app/api/ai/openai";
import { generalPrompt } from "@/utils/config";

const planBody = z.object({ message: z.string() });
export type PlanBody = z.infer<typeof planBody>;
export type PlanResponse = Awaited<ReturnType<typeof plan>>;

export const runtime = "edge";

async function plan(body: PlanBody) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k",
    messages: [{
      role: 'system',
      content: `You are an AI assistant that helps people get to inbox zero quickly by responding, archiving and labelling emails on the user's behalf.
The user will send email messages and it is your job to return the category of the email.
You will always return valid JSON as a response.
The JSON should contain the following fields:

category: string
plan: string
response?: string
label?: string

Categories to use are: "spam", "promotions", "social", "requires_response", "requires_action", "receipts", "newsletter", "app_update", "terms_and_conditions_update".
Plans to use are: "archive", "label", "respond".
Labels to use are: "newsletter", "receipts".

If you have decided to respond to the email, you must include a "response" field with the response you want to send. Otherwise the "response" field must be omitted.
If you have decided to label the email, you must include a "label" field with the label. Otherwise the "label" field must be omitted.
`,
    }, {
      role: 'user',
      content: `${generalPrompt}`,
    }, {
      role: 'user',
      content: `
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.

The email in question is:\n\n###\n\n${body.message}
`
    }],
  });
  const json = await response.json();
  const message: string = json?.choices?.[0]?.message?.content;
  console.log("🚀 ~ file: route.ts:48 ~ plan ~ message:", message)

  return { message };
}

export async function POST(request: Request) {
  const json = await request.json();
  const body = planBody.parse(json);
  const res = await plan(body);

  return NextResponse.json(res);
}
