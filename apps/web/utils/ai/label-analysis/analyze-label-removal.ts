import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { GroupItemType } from "@prisma/client";

export const LabelRemovalAction = {
  NO_ACTION: "no_action",
  EXCLUDE_PATTERN: "exclude_pattern",
  NOT_INCLUDE: "not_include",
} as const;

export type LabelRemovalAction =
  (typeof LabelRemovalAction)[keyof typeof LabelRemovalAction];

const schema = z.object({
  patterns: z
    .array(
      z.object({
        reasoning: z
          .string()
          .describe(
            "A short human-readable explanation of why this learned pattern is important to learn",
          ),
        type: z
          .nativeEnum(GroupItemType)
          .describe(
            "The pattern type which can be FROM (sender/domain), SUBJECT (sender/domain/subject keyword), or BODY (content)",
          ),
        value: z
          .string()
          .describe(
            "The specific value for the learned pattern (e.g., email address, domain, subject keyword)",
          ),
        exclude: z
          .boolean()
          .describe(
            "Whether this learned pattern should be excluded (true) or just not included (false)",
          ),
      }),
    )
    .nullish()
    .describe("Array of patterns to learn from this label removal"),
});

export type LabelRemovalAnalysis = z.infer<typeof schema>;

export async function aiAnalyzeLabelRemoval({
  matchedRules,
  email,
  emailAccount,
}: {
  matchedRules: {
    systemType: string;
    instructions: string | null;
    ruleName: string;
  }[];
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
}): Promise<LabelRemovalAnalysis> {
  const system = `You are an assistant that manages learned patterns in Inbox Zero.  
You cannot act directly on the inbox; only can propose learned patterns or no action.

What are Learned Patterns?
- Automatically discovered email patterns that consistently trigger the same action.  
- They tie directly to rules:
  - Include → always apply the rule  
  - Exclude → always skip the rule  
- They override rule logic when repeated behavior is observed.  
- They reduce repeated AI processing for the same senders, subjects, or bodies.

What are Rules?
- A rule consists of a **condition** and a set of **actions**.  
- Conditions can be static (FROM, TO, SUBJECT) or AI instructions.  
- Actions include applying/removing labels, archiving, forwarding, replying, or skipping emails.  
- Learned patterns complement rules by automatically adjusting behavior based on repeated user actions or corrections.

In this context, we focus only on label removals, which is an action taken by the user and can result from:
1. AI miscategorization → The removed label was incorrectly applied by the AI.
2. One-off action → The removed label represents a temporary or situational tag (e.g., "To Do" or "To Reply") and should not generate a learned pattern.

Guidelines
- Only propose a learned pattern if you are highly confident that the removal reflects a repeated behavior.
Do not generate an exclude pattern if the AI correctly categorized the email; only create excludes when a label was wrongly applied and removed by the user.  
- Use the labels removed and any instructions for adding them in the first place as context to determine the appropriate action and whether a learned pattern should be generated.
`;

  const prompt = `Context the AI used to add the labels

<labels>
  ${matchedRules
    .map(({ systemType, instructions, ruleName }, index) =>
      [
        `<label_${index}>`,
        `<label_system_type>${systemType}</label_system_type>`,
        `<label_name>${ruleName}</label_name>`,
        `<instructions_for_adding_label>${instructions || "No instructions provided"}</instructions_for_adding_label>`,
        `</label_${index}>`,
      ].join("\n"),
    )
    .join("\n")}
</labels>

Content of the email that has the label removed
<email>
${stringifyEmail(email, 1000)}
</email>`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "label-removal-analysis",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return aiResponse.object;
}
