import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { type GroupItem, GroupItemType } from "@prisma/client";

const schema = z.object({
  action: z
    .enum(["EXCLUDE", "REMOVE", "NO_ACTION"])
    .describe(
      "The action to take, EXCLUDE to add an exclude learned pattern, REMOVE to remove an existing pattern, NO_ACTION if nothing should be done",
    ),
  pattern: z
    .object({
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
    })
    .nullish()
    .describe(
      "The pattern to learn from or remove based on this label removal",
    ),
});

export type LabelRemovalAnalysis = z.infer<typeof schema>;

export async function aiAnalyzeLabelRemoval({
  matchedRule,
  email,
  emailAccount,
}: {
  matchedRule: {
    systemType: string;
    instructions: string | null;
    labelName: string;
    learnedPatterns: Pick<
      GroupItem,
      "type" | "value" | "exclude" | "reasoning"
    >[];
  };
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
}): Promise<LabelRemovalAnalysis> {
  const system = `You are an email expert managing a user's inbox. Focus only on label removals.

What are Rules?
- Define conditions (static or AI) and actions (labels, archive, forward, etc.).

What are Learned Patterns?
- Discovered from repeated user behavior.  
- Can *include* (always apply) or *exclude* (always skip).  
- Override rules when consistent patterns emerge.  

Given:  
- The email
- The rule and learned patterns that matched
- The label removed by the user

Decide if a learned pattern adjustment is needed:  
1. If match came from a learned pattern → should it be removed or converted to EXCLUDE?  
2. If match came from an AI instruction → should an EXCLUDE pattern be added?  
3. If match came from a static condition → do nothing.  

Guidelines
- Prefer NO_ACTIONif label removal seems like a mistake or if unsure about pattern inference.  
- Use EXCLUDE only with clear evidence the label is unwanted.
- Use REMOVE only when certain a learned pattern is wrong.
- Always provide reasoning.
- Not every label removal requires a new pattern.
`;

  const prompt = `The rule:

<rule>
  <system_type>${matchedRule.systemType}</system_type>
  <label>${matchedRule.labelName}</label>
  <instructions>${matchedRule.instructions || "No instructions provided"}</instructions>
  <learned_patterns>
    ${matchedRule.learnedPatterns.map((pattern) => `<pattern_type>${pattern.type}</pattern_type><pattern_value>${pattern.value}</pattern_value><pattern_exclude>${pattern.exclude}</pattern_exclude><pattern_reasoning>${pattern.reasoning || "User provided"}</pattern_reasoning>`).join("\n")}
  </learned_patterns>
</rule>

The email:
<email>
${stringifyEmail(email, 1000)}
</email>

The label:
<label>
${matchedRule.labelName}
</label>`;

  const modelOptions = getModel(emailAccount.user);

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
