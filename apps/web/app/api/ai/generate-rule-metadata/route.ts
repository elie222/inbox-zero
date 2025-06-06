import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getEmailAccountAccess } from "@/utils/user/email-account-access";
import { ActionType } from "@prisma/client";
import { SafeError } from "@/utils/error";
import { chatCompletionObject } from "@/utils/llms";
import { withError } from "@/utils/middleware";
import { validateUserAndAiAccess } from "@/utils/user/validate";

const generateRuleMetadataBody = z.object({
  emailAccountId: z.string(),
  ruleContent: z.string(),
});

const ruleMetadataSchema = z.object({
  name: z.string(),
  actions: z.array(z.object({
    type: z.nativeEnum(ActionType),
    label: z.string().optional(),
    subject: z.string().optional(),
    content: z.string().optional(),
    to: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    url: z.string().optional(),
  })),
});

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const body = generateRuleMetadataBody.parse(json);

  const hasAccess = await getEmailAccountAccess(
    session.user.id,
    body.emailAccountId
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { emailAccount } = await validateUserAndAiAccess({ 
    emailAccountId: body.emailAccountId 
  });

  const result = await chatCompletionObject({
    userAi: {
      aiProvider: emailAccount.user.aiProvider,
      aiModel: emailAccount.user.aiModel,
      aiApiKey: emailAccount.user.aiApiKey,
    },
    prompt: `Based on the following email rule description, generate a structured rule with a name and actions.

Rule description: "${body.ruleContent}"

Analyze the rule and provide:
1. A concise, descriptive name for the rule
2. A list of actions to take (from these types: ARCHIVE, LABEL, REPLY, SEND_EMAIL, FORWARD, DRAFT_EMAIL, MARK_SPAM, CALL_WEBHOOK, MARK_READ, TRACK_THREAD)

For each action, include any relevant details like:
- For LABEL: the label name
- For DRAFT_EMAIL/REPLY/SEND_EMAIL: subject and content templates
- For FORWARD: the email address to forward to
- For CALL_WEBHOOK: the webhook URL

Only include the fields relevant to each action type.`,
    schema: ruleMetadataSchema,
    userEmail: session.user.email,
    usageLabel: "generate-rule-metadata",
  });

  return NextResponse.json({
    metadata: result.object,
  });
});