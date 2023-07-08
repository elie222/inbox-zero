import { z } from "zod";
import { NextResponse } from "next/server";
import { openai } from "@/app/api/ai/openai";
import { generalPrompt } from "@/utils/config";
import { getPlan, planSchema, savePlan } from "@/utils/plan";

const planBody = z.object({ id: z.string(), message: z.string() });
export type PlanBody = z.infer<typeof planBody>;
export type PlanResponse = Awaited<ReturnType<typeof plan>>;

export const runtime = "edge";

async function calculatePlan(message: string) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    max_tokens: 400,
    messages: [{
      role: 'system',
      content: `You are an AI assistant that helps people get to inbox zero quickly by responding, archiving and labelling emails on the user's behalf.
The user will send email messages and it is your job to return the category of the email.
You will always return valid JSON as a response.
The JSON should contain the following fields:

action: "archive", "label", "respond"
label?: "newsletter", "receipts"
category: "spam", "promotions", "social", "requires_response", "requires_action", "receipts", "newsletter", "app_update", "terms_and_conditions_update"
response?: string

If you have decided to respond to the email, you must include a "response" field with the response you want to send. Otherwise the "response" field must be omitted.
If you have decided to label the email, you must include a "label" field with the label. Otherwise the "label" field must be omitted.

An example response to label an email as a newsletter is:
{
  "action": "label",
  "category": "newsletter",
  "label": "newsletter"
}
`,
    }, {
      role: 'user',
      content: `${generalPrompt}`,
    }, {
      role: 'user',
      content: `
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.

The email:\n\n###\n\n${message.substring(0, 6000)}
`
    }],
  });
  const json = await response.json();
  return json;
}

// const plan = withRetry(
async function plan(body: PlanBody) {
  // TODO secure this endpoint so people can't just ask for any id (and see the response from gpt)

  // check cache
  // const data = await getPlan({ threadId: body.id })
  // if (data) return { plan: data };

  let json = await calculatePlan(body.message);
  const planString: string = json?.choices?.[0]?.message?.content;

  if (!planString) {
    console.error('plan string undefined')
    console.error('length', body.message.length)
    console.error('json', json)
  }
  if (json.error?.type === 'tokens') return { plan: undefined };
  const planJson = planSchema.parse(JSON.parse(planString));

  // cache result
  await savePlan({ threadId: body.id, plan: planJson });

  return { plan: planJson };
}
// );

export async function POST(request: Request) {
  const json = await request.json();
  const body = planBody.parse(json);
  const res = await plan(body);

  return NextResponse.json(res);
}
