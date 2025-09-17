import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  createRuleSchema,
  type CreateRuleSchemaWithCategories,
  getCreateRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";
import { createScopedLogger } from "@/utils/logger";
import { convertMentionsToLabels } from "@/utils/mention";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("ai-prompt-to-rules");

export async function aiPromptToRules({
  emailAccount,
  promptFile,
  availableCategories,
}: {
  emailAccount: EmailAccountWithAI;
  promptFile: string;
  availableCategories?: string[];
}): Promise<CreateRuleSchemaWithCategories[]> {
  function getSchema() {
    if (availableCategories?.length) {
      return getCreateRuleSchemaWithCategories(
        availableCategories as [string, ...string[]],
        emailAccount.account.provider,
      );
    }

    return createRuleSchema(emailAccount.account.provider);
  }

  const system = getSystemPrompt({
    hasSmartCategories: !!availableCategories?.length,
  });

  const cleanedPromptFile = convertMentionsToLabels(promptFile);

  const prompt = `Convert the following prompt file into rules:
  
<prompt>
${cleanedPromptFile}
</prompt>`;

  const modelOptions = getModel(emailAccount.user, "chat");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Prompt to rules",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    prompt,
    system,
    schema: z.object({ rules: z.array(getSchema()) }),
  });

  if (!aiResponse.object) {
    logger.error("No rules found in AI response", { aiResponse });
    throw new Error("No rules found in AI response");
  }

  const rules = aiResponse.object.rules;

  return rules;
}

function getSystemPrompt({
  hasSmartCategories,
}: {
  hasSmartCategories: boolean;
}) {
  return `You are an AI assistant that converts email management rules into a structured format. Parse the given prompt and convert it into rules.

IMPORTANT: If a user provides a snippet, use that full snippet in the rule. Don't include placeholders unless it's clear one is needed.

You can use multiple conditions in a rule, but aim for simplicity.
In most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
If a rule can be handled fully with static conditions, do so, but this is rarely possible.

IMPORTANT: You must return a JSON object.

<examples>
  <example>
    <input>
      When I get a newsletter, archive it and label it as "Newsletter"
    </input>
    <output>
      {
        "rules": [{
          "name": "Label Newsletters",
          "condition": {
            "aiInstructions": "Apply this rule to newsletters"
            ${
              hasSmartCategories
                ? `,
              "categories": {
                "categoryFilterType": "INCLUDE",
                "categoryFilters": ["Newsletters"]
              },
              "conditionalOperator": "OR"`
                : ""
            }
          },
          "actions": [
            {
              "type": "ARCHIVE"
            },
            {
              "type": "LABEL",
              "fields": {
                "label": "Newsletter"
              }
            }
          ]
        }]
      }
    </output>
  </example>

  <example>
    <input>
      When someone mentions system outages or critical issues, forward to urgent-support@company.com and label as Urgent-Support
    </input>
    <output>
      {
        "rules": [{
          "name": "Forward Urgent Emails",
          "condition": {
            "aiInstructions": "Apply this rule to emails mentioning system outages or critical issues"
          },
          "actions": [
            {
              "type": "FORWARD",
              "fields": {
                "to": "urgent-support@company.com"
              }
            },
            {
              "type": "LABEL",
              "fields": {
                "label": "Urgent-Support"
              }
            }
          ]
        }]
      }
    </output>
  </example>

  <example>
    <input>
      Label all urgent emails from company.com as "Urgent"
    </input>
    <output>
      {
        "rules": [{
          "name": "Matt Urgent Emails",
          "condition": {
            "conditionalOperator": "AND",
            "aiInstructions": "Apply this rule to urgent emails",
            "static": {
              "from": "@company.com"
            }
          },
          "actions": [
            {
              "type": "LABEL",
              "fields": {
                "label": "Urgent"
              }
            }
          ]
        }]
      }
    </output>
  </example>

  <example>
    <input>
      If someone asks to set up a call, draft a reply with my calendar link: https://cal.com/example using the following format:
      
      """
      Hi [name],
      Thank you for your message. I'll respond within 2 hours.
      Best,
      Alice
      """
    </input>
    <output>
      {
        "rules": [{
          "name": "Reply to Call Requests",
          "condition": {
            "aiInstructions": "Apply this rule to emails from people asking to set up a call"
          },
          "actions": [
            {
              "type": "REPLY",
              "fields": {
                "content": "Hi {{name}},\nThank you for your message.\nI'll respond within 2 hours.\nBest,\nAlice"
              }
            }
          ]
        }]
      }
    </output>
  </example>
</examples>
`;
}
