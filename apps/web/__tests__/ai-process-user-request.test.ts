import { describe, expect, test, vi } from "vitest";
import stripIndent from "strip-indent";
import { processUserRequest } from "@/utils/ai/assistant/process-user-request";
import type { ParsedMessage, ParsedMessageHeaders } from "@/utils/types";
import type { GroupItem, Prisma } from "@/generated/prisma/client";
import { GroupItemType, LogicalOperator } from "@/generated/prisma/enums";
import { getEmailAccount } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
import type { RuleWithRelations } from "@/utils/rule/types";

// pnpm test-ai ai-process-user-request

const logger: ReturnType<typeof createScopedLogger> =
  createScopedLogger("test");

const isAiTest = process.env.RUN_AI_TESTS === "true";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/gmail/mail", () => ({ replyToEmail: vi.fn() }));

describe(
  "processUserRequest",
  {
    timeout: 30_000,
    skip: !isAiTest,
  },
  () => {
    test("should fix a rule with incorrect AI instructions", async () => {
      const rule = getRule({
        name: "Partnership Rule",
        instructions: "Match emails discussing business opportunities",
      });

      const originalEmail = getParsedMessage({
        headers: {
          from: "sales@company.com",
          subject: "Special Offer for Your Business",
        },
        textPlain: stripIndent(`
        Hi there,

        We have an amazing product that could boost your revenue by 300%.
        Special discount available this week only!

        Let me know if you'd like a demo.

        Best,
        Sales Team
      `),
      });

      const result = await processUserRequest({
        emailAccount: getEmailAccount(),
        rules: [rule],
        messages: [
          {
            role: "user",
            content: "This is a promotional email",
          },
        ],
        originalEmail,
        matchedRule: rule,
        logger,
      });

      expect(result).toBeDefined();

      const toolCalls = result.steps.flatMap((step) => step.toolCalls);
      const updateInstructionsToolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "update_ai_instructions",
      );

      expect(updateInstructionsToolCall).toBeDefined();
      expect(
        (updateInstructionsToolCall!.input as { ruleName: string }).ruleName,
      ).toBe("Partnership Rule");
    });

    test("should handle request to refine ai rule instructions", async () => {
      const ruleSupport = getRule({
        name: "Support Rule",
        instructions: "Match technical support requests",
      });
      const ruleUrgent = getRule({
        name: "Urgent Rule",
        instructions: "Match urgent requests",
      });

      const originalEmail = getParsedMessage({
        headers: {
          from: "user@test.com",
          subject: "Help with Login",
        },
        textPlain: stripIndent(`
        Hello,

        I can't log into my account. Can someone help?

        Thanks,
        User
      `),
      });

      const result = await processUserRequest({
        emailAccount: getEmailAccount(),
        rules: [ruleSupport, ruleUrgent],
        messages: [
          {
            role: "user",
            content: "This isn't urgent.",
          },
        ],
        originalEmail,
        matchedRule: ruleUrgent,
        logger,
      });

      expect(result).toBeDefined();

      const toolCalls = result.steps.flatMap((step) => step.toolCalls);

      const toolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "update_ai_instructions",
      );

      expect(toolCall).toBeDefined();
      expect(toolCall).toBeTruthy();
    });

    test("should fix static conditions when user indicates incorrect matching", async () => {
      const rule = getRule({
        name: "Receipt Rule",
        from: "@amazon.com",
        subject: "Order",
      });

      const originalEmail = getParsedMessage({
        headers: {
          from: "shipping@amazon.com",
          subject: "Order #123 Has Shipped",
        },
        textPlain: stripIndent(`
          Your order has shipped!
          Tracking number: 1234567890
          Expected delivery: Tomorrow
        `),
      });

      const result = await processUserRequest({
        emailAccount: getEmailAccount(),
        rules: [rule],
        messages: [
          {
            role: "user",
            content: "This isn't a receipt, it's a shipping notification.",
          },
        ],
        originalEmail,
        matchedRule: rule,
        logger,
      });

      const toolCalls = result.steps.flatMap((step) => step.toolCalls);
      const updateStaticConditionsToolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "update_static_conditions",
      );

      expect(updateStaticConditionsToolCall).toBeDefined();
      const staticConditionsInput = updateStaticConditionsToolCall!.input as {
        ruleName: string;
        staticConditions?: { subject?: string };
      };
      expect(staticConditionsInput.ruleName).toBe("Receipt Rule");
      expect(
        staticConditionsInput.staticConditions?.subject?.includes("shipping") ||
          staticConditionsInput.staticConditions?.subject?.includes("Shipped"),
      ).toBe(true);
    });

    test("should fix group conditions when user reports incorrect matching", async () => {
      const group = getGroup({
        name: "Newsletters",
        items: [
          getGroupItem({
            id: "1",
            type: GroupItemType.FROM,
            value: "david@hello.com",
          }),
          getGroupItem({
            id: "2",
            type: GroupItemType.FROM,
            value: "@beehiiv.com",
          }),
        ],
      });

      const rule = getRule({
        name: "Newsletter Rule",
        group,
      });

      const originalEmail = getParsedMessage({
        headers: {
          from: "david@hello.com",
          subject: "Question about your latest post",
        },
        textPlain: stripIndent(`
          Hey there,

          Thanks for reaching out about my article on microservices. You raised some 
          really interesting points about the scalability challenges you're facing.

          I actually dealt with a similar issue at my previous company. Would love to 
          hop on a quick call to discuss it in more detail.

          Best,
          David
        `),
      });

      const result = await processUserRequest({
        emailAccount: getEmailAccount(),
        rules: [rule],
        messages: [
          {
            role: "user",
            content: "This isn't a newsletter",
          },
        ],
        originalEmail,
        matchedRule: rule,
        logger,
      });

      const toolCalls = result.steps.flatMap((step) => step.toolCalls);
      const removeFromGroupToolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "remove_from_group",
      );

      expect(removeFromGroupToolCall).toBeDefined();
      expect((removeFromGroupToolCall!.input as { value: string }).value).toBe(
        "david@hello.com",
      );
    });

    test("should suggest adding sender to group when identified as missing", async () => {
      const group = getGroup({
        name: "Newsletters",
        items: [
          getGroupItem({
            type: GroupItemType.FROM,
            value: "ainewsletter@substack.com",
          }),
          getGroupItem({
            type: GroupItemType.FROM,
            value: "milkroad@beehiiv.com",
          }),
        ],
      });

      const rule = getRule({
        name: "Newsletter Rule",
        group,
      });

      const originalEmail = getParsedMessage({
        headers: {
          from: "mattsnews@convertkit.com",
          to: "me@ourcompany.com",
          subject: "Weekly Developer Digest",
        },
        textPlain: stripIndent(`
          This Week's Top Stories:
          
          1. The Future of TypeScript
          2. React Server Components Deep Dive
          3. Building Scalable Systems
          
          To unsubscribe, click here
          Powered by ConvertKit
        `),
      });

      const result = await processUserRequest({
        emailAccount: getEmailAccount(),
        rules: [rule],
        messages: [
          {
            role: "user",
            content: "This is a newsletter",
          },
        ],
        originalEmail,
        matchedRule: null, // Important: rule didn't match initially
        logger,
      });

      const toolCalls = result.steps.flatMap((step) => step.toolCalls);
      const addToGroupToolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "add_to_group",
      );

      expect(addToGroupToolCall).toBeDefined();
      const addToGroupInput = addToGroupToolCall!.input as {
        type: string;
        value: string;
      };
      expect(addToGroupInput.type).toBe("from");
      expect(addToGroupInput.value).toContain("convertkit.com");
    });

    test("should fix category filters when user indicates wrong categorization", async () => {
      const rule = getRule({
        name: "Marketing Rule",
        categoryFilterType: "INCLUDE",
      });

      const originalEmail = getParsedMessage({
        headers: {
          from: "marketing@company.com",
          subject: "Special Offer",
        },
        textPlain: "Would you like to purchase our enterprise plan?",
      });

      const result = await processUserRequest({
        emailAccount: getEmailAccount(),
        rules: [rule],
        messages: [
          {
            role: "user",
            content: "This is actually a sales email, not marketing.",
          },
        ],
        originalEmail,
        matchedRule: rule,
        logger,
      });

      const toolCalls = result.steps.flatMap((step) => step.toolCalls);
      const updateSenderCategoryToolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "update_sender_category",
      );

      expect(updateSenderCategoryToolCall).toBeDefined();
      expect(
        (updateSenderCategoryToolCall!.input as { category: string }).category,
      ).toBe("Sales");
    });

    test("should handle complex rule fixes with multiple condition types", async () => {
      const rule = getRule({
        name: "Sales Rule",
        instructions: "Match sales opportunities",
        from: "@enterprise.com",
        subject: "Business opportunity",
        categoryFilterType: "INCLUDE",
      });

      const originalEmail = getParsedMessage({
        headers: {
          from: "contact@enterprise.com",
          subject: "Business opportunity - Act now!",
        },
        textPlain: "Make millions with this amazing opportunity!",
      });

      const result = await processUserRequest({
        emailAccount: getEmailAccount(),
        rules: [rule],
        messages: [
          {
            role: "user",
            content:
              "This is a spam email pretending to be a business opportunity.",
          },
        ],
        originalEmail,
        matchedRule: rule,
        logger,
      });

      const toolCalls = result.steps.flatMap((step) => step.toolCalls);

      const updateStaticConditionsToolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "update_static_conditions",
      );
      const updateAiInstructionsToolCall = toolCalls.find(
        (toolCall) => toolCall?.toolName === "update_ai_instructions",
      );

      expect(
        updateStaticConditionsToolCall || updateAiInstructionsToolCall,
      ).toBeDefined();
      if (updateStaticConditionsToolCall) {
        expect(
          (updateStaticConditionsToolCall.input as { ruleName: string })
            .ruleName,
        ).toBe("Sales Rule");
      }
      if (updateAiInstructionsToolCall) {
        expect(
          (updateAiInstructionsToolCall.input as { ruleName: string }).ruleName,
        ).toBe("Sales Rule");
      }
    });
  },
);

function getRule(rule: Partial<RuleWithRelations>): RuleWithRelations {
  return {
    id: "1",
    emailAccountId: "user1",
    name: "Rule name",

    conditionalOperator: LogicalOperator.AND,
    // ai instructions
    instructions: null,
    // static conditions
    from: null,
    to: null,
    subject: null,
    body: null,
    // group conditions
    group: null,
    groupId: null,
    // category conditions
    categoryFilterType: null,

    // other
    actions: [],
    automate: true,
    runOnThreads: true,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    systemType: null,
    promptText: null,
    ...rule,
  };
}

function getParsedMessage(
  message: Omit<Partial<ParsedMessage>, "headers"> & {
    headers?: Partial<ParsedMessageHeaders>;
  },
): ParsedMessage {
  const defaultHeaders: ParsedMessageHeaders = {
    from: "test@example.com",
    to: "recipient@example.com",
    subject: "",
    date: new Date().toISOString(),
    references: "",
    "message-id": "message-id",
  };

  const mergedHeaders: ParsedMessageHeaders = {
    ...defaultHeaders,
    ...message.headers,
    date: (message.headers?.date ?? defaultHeaders.date) as string,
    subject: (message.headers?.subject ?? defaultHeaders.subject) as string,
  };

  return {
    id: "id",
    threadId: "thread-id",
    snippet: "",
    attachments: [],
    historyId: "history-id",
    internalDate: new Date().toISOString(),
    inline: [],
    textPlain: "",
    ...message,
    headers: mergedHeaders,
    subject: mergedHeaders.subject,
    date: mergedHeaders.date,
  };
}

type Group = Prisma.GroupGetPayload<{
  select: {
    id: true;
    name: true;
    items: { select: { id: true; type: true; value: true } };
  };
}>;

function getGroup(group: Partial<Group>): Group {
  return {
    id: "id",
    name: "Group name",
    items: [],
    ...group,
  };
}

function getGroupItem(item: Partial<GroupItem>): GroupItem {
  return {
    id: "id",
    value: "",
    type: GroupItemType.FROM,
    createdAt: new Date(),
    updatedAt: new Date(),
    groupId: "group1",
    exclude: false,
    ...item,
  };
}
