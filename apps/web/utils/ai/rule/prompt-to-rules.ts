import { z } from "zod";
import { tool } from "ai";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  type CreateOrUpdateRuleSchemaWithCategories,
  createRuleSchema,
  getCreateRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";
import { createScopedLogger } from "@/utils/logger";
import { convertMentionsToLabels } from "@/utils/mention";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("ai-prompt-to-rules");

const updateRuleSchema = createRuleSchema.extend({
  ruleId: z.string().optional(),
});

export async function aiPromptToRules({
  emailAccount,
  promptFile,
  isEditing,
  availableCategories,
}: {
  emailAccount: EmailAccountWithAI;
  promptFile: string;
  isEditing: boolean;
  availableCategories?: string[];
}): Promise<CreateOrUpdateRuleSchemaWithCategories[]> {
  function getSchema() {
    if (availableCategories?.length) {
      const createRuleSchemaWithCategories = getCreateRuleSchemaWithCategories(
        availableCategories as [string, ...string[]],
      );
      const updateRuleSchemaWithCategories =
        createRuleSchemaWithCategories.extend({
          ruleId: z.string().optional(),
        });

      return isEditing
        ? updateRuleSchemaWithCategories
        : createRuleSchemaWithCategories;
    }
    return isEditing ? updateRuleSchema : createRuleSchema;
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

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "Prompt to rules",
    modelOptions,
  });

  const aiResponse = await generateText({
    ...modelOptions,
    prompt,
    system,
    tools: {
      parseRules: tool({
        description: "Parse rules from prompt file",
        inputSchema: getSchema(),
      }),
    },
  });

  const toolCall = aiResponse.toolCalls.find(
    (toolCall) => toolCall.toolName === "parseRules",
  );

  if (!toolCall) {
    logger.error("No rules found in AI response", { aiResponse });
    throw new Error("No rules found in AI response");
  }

  const rules = (toolCall.input as any)?.rules;

  return rules as CreateOrUpdateRuleSchemaWithCategories[];
}

function getSystemPrompt({
  hasSmartCategories,
}: {
  hasSmartCategories: boolean;
}) {
  return `You are an AI assistant that converts email management rules into a structured format. Parse the given prompt file and conver them into rules.

IMPORTANT: If a user provides a snippet, use that full snippet in the rule. Don't include placeholders unless it's clear one is needed.

You can use multiple conditions in a rule, but aim for simplicity.
In most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
If a rule can be handled fully with static conditions, do so, but this is rarely possible.

<examples>
  <example>
    <input>
      When I get a newsletter, archive it and label it as "Newsletter"
    </input>
    <output>
      [{
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
    </output>
  </example>

  <example>
    <input>
      When someone mentions system outages or critical issues, forward to urgent-support@company.com and label as Urgent-Support
    </input>
    <output>
      [{
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
    </output>
  </example>

  <example>
    <input>
      Label all urgent emails from company.com as "Urgent"
    </input>
    <output>
      [{
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
      [{
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
    </output>
  </example>
</examples>
`;
}
