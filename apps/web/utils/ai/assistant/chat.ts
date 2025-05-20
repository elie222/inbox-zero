import { streamText, tool } from "ai";
import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import prisma, { isDuplicateError } from "@/utils/prisma";
import {
  createRule,
  partialUpdateRule,
  updateRuleActions,
} from "@/utils/rule/rule";
import { ActionType, GroupItemType, LogicalOperator } from "@prisma/client";
import { saveAiUsage } from "@/utils/usage";
import { getModel } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";

const logger = createScopedLogger("ai/assistant/chat");

export const maxDuration = 120;

// schemas
export type CreateRuleSchema = z.infer<typeof createRuleSchema>;

const updateRuleConditionSchema = z.object({
  ruleName: z.string().describe("The name of the rule to update"),
  condition: z.object({
    aiInstructions: z.string().optional(),
    static: z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
      })
      .optional(),
    conditionalOperator: z
      .enum([LogicalOperator.AND, LogicalOperator.OR])
      .optional(),
  }),
});
export type UpdateRuleConditionSchema = z.infer<
  typeof updateRuleConditionSchema
>;

const updateRuleActionsSchema = z.object({
  ruleName: z.string().describe("The name of the rule to update"),
  actions: z.array(
    z.object({
      type: z.enum([
        ActionType.ARCHIVE,
        ActionType.LABEL,
        ActionType.DRAFT_EMAIL,
        ActionType.FORWARD,
        ActionType.REPLY,
        ActionType.SEND_EMAIL,
        ActionType.MARK_READ,
        ActionType.MARK_SPAM,
        ActionType.CALL_WEBHOOK,
      ]),
      fields: z.object({
        label: z.string().optional(),
        content: z.string().optional(),
        webhookUrl: z.string().optional(),
        to: z.string().optional(),
        cc: z.string().optional(),
        bcc: z.string().optional(),
        subject: z.string().optional(),
      }),
    }),
  ),
});
export type UpdateRuleActionsSchema = z.infer<typeof updateRuleActionsSchema>;

// Schema for updating learned patterns
const updateLearnedPatternsSchema = z.object({
  ruleName: z.string().describe("The name of the rule to update"),
  learnedPatterns: z.array(
    z.object({
      include: z
        .object({
          from: z.string().optional(),
          subject: z.string().optional(),
        })
        .optional(),
      exclude: z
        .object({
          from: z.string().optional(),
          subject: z.string().optional(),
        })
        .optional(),
    }),
  ),
});
export type UpdateLearnedPatternsSchema = z.infer<
  typeof updateLearnedPatternsSchema
>;

// // Keeping the original schema for backward compatibility
// const updateRuleSchema = z.object({
//   ruleName: z.string().describe("The name of the rule to update"),
//   condition: z
//     .object({
//       aiInstructions: z.string(),
//       static: z.object({
//         from: z.string(),
//         to: z.string(),
//         subject: z.string(),
//         body: z.string(),
//       }),
//       conditionalOperator: z.enum([LogicalOperator.AND, LogicalOperator.OR]),
//     })
//     .optional(),
//   actions: z.array(
//     z
//       .object({
//         type: z.enum([
//           ActionType.ARCHIVE,
//           ActionType.LABEL,
//           ActionType.REPLY,
//           ActionType.SEND_EMAIL,
//           ActionType.FORWARD,
//           ActionType.MARK_READ,
//           ActionType.MARK_SPAM,
//           ActionType.CALL_WEBHOOK,
//         ]),
//         fields: z.object({
//           label: z.string().optional(),
//           content: z.string().optional(),
//           webhookUrl: z.string().optional(),
//         }),
//       })
//       .optional(),
//   ),
//   learnedPatterns: z
//     .array(
//       z.object({
//         include: z.object({
//           from: z.string(),
//           subject: z.string(),
//         }),
//         exclude: z.object({
//           from: z.string(),
//           subject: z.string(),
//         }),
//       }),
//     )
//     .optional(),
// });
// export type UpdateRuleSchema = z.infer<typeof updateRuleSchema>;

const updateAboutSchema = z.object({ about: z.string() });
export type UpdateAboutSchema = z.infer<typeof updateAboutSchema>;

export async function aiProcessAssistantChat({
  messages,
  emailAccountId,
  user,
}: {
  messages: { role: "user" | "assistant"; content: string }[];
  emailAccountId: string;
  user: EmailAccountWithAI;
}) {
  const system = `You are an assistant that helps create and update rules to manage a user's inbox. Our platform is called Inbox Zero.
  
You can't perform any actions on their inbox.
You can only adjust the rules that manage the inbox.

A rule is comprised of:
1. A condition
2. A set of actions

A condition can be:
1. AI instructions
2. Static

An action can be:
1. Archive
2. Label
3. Draft a reply
4. Reply
5. Send an email
6. Forward
7. Mark as read
8. Mark spam
9. Call a webhook

You can use {{variables}} in the fields to insert AI generated content. For example:
"Hi {{name}}, {{write a friendly reply}}, Best regards, Alice"

Rule matching logic:
- All static conditions (from, to, subject, body) use AND logic - meaning all static conditions must match
- Top level conditions (AI instructions, static) can use either AND or OR logic, controlled by the "conditionalOperator" setting

Best practices:
- For static conditions, use email patterns (e.g., '@company.com') when matching multiple addresses
- IMPORTANT: do not create new rules unless absolutely necessary. Avoid duplicate rules, so make sure to check if the rule already exists.
- You can use multiple conditions in a rule, but aim for simplicity.
- When creating rules, in most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
- If a rule can be handled fully with static conditions, do so, but this is rarely possible.
- IMPORTANT: prefer "draft a reply" over "reply". Only if the user explicitly asks to reply, then use "reply". Clarify beforehand this is the intention. Drafting a reply is safer as it means the user can approve before sending.

Always explain the changes you made.
Use simple language and avoid jargon in your reply.
If you are unable to fix the rule, say so.

You can set general infomation about the user too that will be passed as context when the AI is processing emails.
Reply Zero is a feature that labels emails that need a reply "To Reply". And labels emails that are awaiting a response "Awaiting". The also is also able to see these in a minimalist UI within Inbox Zero which only shows which emails the user needs to reply to or is awaiting a response on.
Don't tell the user which tools you're using. The tools you use will be displayed in the UI anyway.
Don't use placeholders in rules you create. For example, don't use @company.com. Use the user's actual company email address. And if you don't know some information you need, ask the user.

Learned patterns:
- Learned patterns override the conditional logic for a rule.
- This avoids us having to use AI to process emails from the same sender over and over again.
- There's some similarity to static rules, but you can only use one static condition for a rule. But you can use multiple learned patterns. And over time the list of learned patterns will grow.
- You can use includes or excludes for learned patterns. Usually you will use includes, but if the user has explained that an email is being wrongly labelled, check if we have a learned pattern for it and then fix it to be an exclude instead.

Knowledge base:
- The knowledge base is used to draft reply content.
- It is only used when an action of type DRAFT_REPLY is used AND the rule has no preset draft content.

Examples:

<examples>
  <example>
    <input>
      When I get a newsletter, archive it and label it as "Newsletter"
    </input>
    <output>
      <create_rule>
        {
          "name": "Label Newsletters",
          "condition": { "aiInstructions": "Newsletters" },
          "actions": [
            {
              "type": "archive",
              "fields": {}
            },
            {
              "type": "label",
              "fields": {
                "label": "Newsletter"
              }
            }
          ]
        }
      </create_rule>
      <explanation>
        I created a rule to label newsletters.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      I run a marketing agency and use this email address for cold outreach.
      If someone shows interest, label it "Interested".
      If someone says they're interested in learning more, send them my Cal link (cal.com/alice).
      If they ask for more info, send them my deck (https://drive.google.com/alice-deck.pdf).
      If they're not interested, label it as "Not interested" and archive it.
      If you don't know how to respond, label it as "Needs review".
    </input>
    <output>
      <update_about>
        I run a marketing agency and use this email address for cold outreach.
        My cal link is https://cal.com/alice
        My deck is https://drive.google.com/alice-deck.pdf
        Write concise and friendly replies.
      </update_about>
      <create_rule>
        {
          "name": "Interested",
          "condition": { "aiInstructions": "When someone shows interest in setting up a call or learning more." },
          "actions": [
            {
              "type": "label",
              "fields": {
                "label": "Interested"
              }
            },
            {
              "type": "draft",
              "fields": {
                "content": "{{draft a reply}}"
              }
            }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Not Interested",
          "condition": { "aiInstructions": "When someone says they're not interested." },
          "actions": [
            {
              "type": "label",
              "fields": {
                "label": "Not Interested"
              }
            },
            {
              "type": "archive",
              "fields": {}
            }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Needs Review",
          "condition": { "aiInstructions": "When you don't know how to respond." },
          "actions": [
            {
              "type": "label",
              "fields": {
                "label": "Needs Review"
              }
            }
          ]
        }
      </create_rule>
      <explanation>
        I created three rules to handle different types of responses.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      Set a rule to archive emails older than 30 days.
    </input>
    <output>
      Inbox Zero doesn't support time-based actions yet. We only process emails as they arrive in your inbox.
    </output>
  </example>

  <example>
    <input>
      Create some good default rules for me.
    </input>
    <output>
      <enable_cold_email_blocker>
        {
          "action": "ARCHIVE_AND_LABEL"
        }
      </enable_cold_email_blocker>
      <enable_reply_zero>
        {
          "enabled": true,
          "draft_replies": true
        }
      </enable_reply_zero>
      <create_rule>
        {
          "name": "Urgent",
          "condition": { "aiInstructions": "Urgent emails" },
          "actions": [
            { "type": "label", "fields": { "label": "Urgent" } }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Newsletters",
          "condition": { "aiInstructions": "Newsletters" },
          "actions": [
            { "type": "archive", "fields": {} },
            { "type": "label", "fields": { "label": "Newsletter" } }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Promotions",
          "condition": { "aiInstructions": "Marketing and promotional emails" },
          "actions": [
            { "type": "archive", "fields": {} },
            { "type": "label", "fields": { "label": "Promotions" } }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Team",
          "condition": { "static": { "from": "@company.com" } },
          "actions": [
            { "type": "label", "fields": { "label": "Team" } }
          ]
        }
      </create_rule>
      <explanation>
        I created 4 rules to handle different types of emails.
        I also enabled the cold email blocker and reply zero feature.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      I don't need to reply to emails from GitHub, stop labelling them as "To reply".
    </input>
    <output>
      <update_rule>
        {
          "name": "To reply",
          "learnedPatterns": [
            { "exclude": { "from": "@github.com" } }
          ]
        }
      </update_rule>
      <explanation>
        I updated the rule to stop labelling emails from GitHub as "To reply".
      </explanation>
    </output>
  </example>
</examples>`;

  // TODO: clean up
  const { provider, model, llmModel, providerOptions } = getModel(
    user.user,
    false,
  );

  logger.trace("Input", { messages });

  const result = streamText({
    model: llmModel,
    messages,
    system,
    maxSteps: 10,
    tools: {
      get_user_rules_and_settings: tool({
        description:
          "Retrieve all existing rules for the user, their about information, and the cold email blocker setting",
        parameters: z.object({}),
        execute: async () => {
          // trackToolCall("list_rules", user.email);
          const [rules, user] = await Promise.all([
            prisma.rule.findMany({ where: { emailAccountId } }),
            prisma.emailAccount.findUnique({
              where: { id: emailAccountId },
              select: { about: true, coldEmailBlocker: true },
            }),
          ]);

          return {
            rules,
            about: user?.about || "Not set",
            coldEmailBlocker: user?.coldEmailBlocker || "Not set",
          };
        },
      }),

      create_rule: tool({
        description: "Create a new rule",
        parameters: createRuleSchema,
        execute: async ({ name, condition, actions }) => {
          logger.info("Create Rule", { name, condition, actions });
          // trackToolCall("create_rule", user.email);

          try {
            const rule = await createRule({
              result: { name, condition, actions },
              emailAccountId,
            });

            if ("error" in rule) {
              logger.error("Error while creating rule", {
                // ...loggerOptions,
                error: rule.error,
              });

              return {
                error: "Failed to create rule",
                message: rule.error,
              };
            }

            // createdRules.set(rule.id, rule);

            return { success: true, ruleId: rule.id };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);

            logger.error("Failed to create rule", {
              // ...loggerOptions,
              error: message,
            });

            return {
              error: "Failed to create rule",
              message,
            };
          }
        },
      }),

      update_rule_conditions: tool({
        description: "Update the conditions of an existing rule",
        parameters: updateRuleConditionSchema,
        execute: async ({ ruleName, condition }) => {
          const rule = await prisma.rule.findUnique({
            where: { id: ruleName, emailAccountId },
          });

          if (!rule) {
            return {
              error:
                "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
            };
          }

          await partialUpdateRule({
            ruleId: rule.id,
            data: {
              instructions: condition.aiInstructions,
              from: condition.static?.from,
              to: condition.static?.to,
              subject: condition.static?.subject,
              body: condition.static?.body,
              conditionalOperator: condition.conditionalOperator,
            },
          });

          return { success: true, ruleId: rule.id };
        },
      }),

      update_rule_actions: tool({
        description:
          "Update the actions of an existing rule. This replaces the existing actions.",
        parameters: updateRuleActionsSchema,
        execute: async ({ ruleName, actions }) => {
          const rule = await prisma.rule.findUnique({
            where: { id: ruleName, emailAccountId },
          });

          if (!rule) {
            return {
              error:
                "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
            };
          }

          await updateRuleActions({
            ruleId: rule.id,
            actions: actions.map((action) => ({
              type: action.type,
              fields: {
                label: action.fields?.label ?? null,
                to: action.fields?.to ?? null,
                cc: action.fields?.cc ?? null,
                bcc: action.fields?.bcc ?? null,
                subject: action.fields?.subject ?? null,
                content: action.fields?.content ?? null,
                webhookUrl: action.fields?.webhookUrl ?? null,
              },
            })),
          });

          return { success: true, ruleId: rule.id };
        },
      }),

      update_learned_patterns: tool({
        description: "Update the learned patterns of an existing rule",
        parameters: updateLearnedPatternsSchema,
        execute: async ({ ruleName, learnedPatterns }) => {
          const rule = await prisma.rule.findUnique({
            where: { id: ruleName, emailAccountId },
          });

          if (!rule) {
            return {
              error:
                "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
            };
          }

          // Convert the learned patterns format
          const patternsToSave: Array<{
            type: GroupItemType;
            value: string;
            exclude?: boolean;
          }> = [];

          for (const pattern of learnedPatterns) {
            if (pattern.include?.from) {
              patternsToSave.push({
                type: GroupItemType.FROM,
                value: pattern.include.from,
                exclude: false,
              });
            }

            if (pattern.include?.subject) {
              patternsToSave.push({
                type: GroupItemType.SUBJECT,
                value: pattern.include.subject,
                exclude: false,
              });
            }

            if (pattern.exclude?.from) {
              patternsToSave.push({
                type: GroupItemType.FROM,
                value: pattern.exclude.from,
                exclude: true,
              });
            }

            if (pattern.exclude?.subject) {
              patternsToSave.push({
                type: GroupItemType.SUBJECT,
                value: pattern.exclude.subject,
                exclude: true,
              });
            }
          }

          if (patternsToSave.length > 0) {
            await saveLearnedPatterns({
              emailAccountId,
              ruleName: rule.name,
              patterns: patternsToSave,
            });
          }

          return { success: true, ruleId: rule.id };
        },
      }),

      update_about: tool({
        description:
          "Update the user's about information. Read the user's about information first as this replaces the existing information.",
        parameters: updateAboutSchema,
        execute: async ({ about }) => {
          const existing = await prisma.emailAccount.findUnique({
            where: { id: emailAccountId },
            select: { about: true },
          });

          if (!existing) return { error: "Account not found" };

          await prisma.emailAccount.update({
            where: { id: emailAccountId },
            data: { about },
          });

          return {
            success: true,
            previousAbout: existing.about,
            updatedAbout: about,
          };
        },
      }),

      add_to_knowledge_base: tool({
        description: "Add content to the knowledge base",
        parameters: z.object({ title: z.string(), content: z.string() }),
        execute: async ({ title, content }) => {
          try {
            await prisma.knowledge.create({
              data: {
                emailAccountId,
                title,
                content,
              },
            });

            return { success: true };
          } catch (error) {
            if (isDuplicateError(error, "title")) {
              return {
                error: "A knowledge item with this title already exists",
              };
            }

            logger.error("Failed to add to knowledge base", { error });
            return { error: "Failed to add to knowledge base" };
          }
        },
      }),
    },
    onFinish: async ({ usage }) => {
      await saveAiUsage({
        email: user.email,
        provider,
        model,
        usage,
        label: "Assistant chat",
      });
    },
    onStepFinish: async ({ usage, text, toolCalls }) => {
      logger.trace("Step finished", { usage, text, toolCalls });
    },
  });

  return result;
}
