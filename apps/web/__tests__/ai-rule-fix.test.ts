import { describe, expect, test, vi } from "vitest";
import { aiRuleFix } from "@/utils/ai/rule/rule-fix";
import type { EmailForLLM } from "@/utils/ai/choose-rule/stringify-email";
import stripIndent from "strip-indent";

// pnpm test ai-rule-fix

vi.mock("server-only", () => ({}));

describe("aiRuleFix", () => {
  test("should fix a rule that incorrectly matched a sales email", async () => {
    const rule = {
      instructions: "Match emails discussing potential business partnerships",
    };

    const salesEmail = getEmail({
      from: "sales@company.com",
      subject: "Special Discount on Our Product",
      content: stripIndent(`
        Hi there,

        I wanted to reach out about our amazing product that could help your business.
        We're offering a special 50% discount this month.

        Would you be interested in scheduling a demo?

        Best regards,
        John from Sales
      `),
    });

    const result = await aiRuleFix({
      rule,
      email: salesEmail,
      user: getUser(),
    });

    expect(result).toBeDefined();
    expect(result.fixedInstructions).toContain("sales");
    expect(result.fixedInstructions).not.toBe(rule.instructions);
    // The new instructions should be more specific to exclude sales pitches
    expect(result.fixedInstructions.toLowerCase()).toMatch(
      /(apply|match).*(partnership|collaboration).*(not|but do not|excluding).*(sales|promotion|discount)/i,
    );

    console.log(`Fixed Instructions: ${result.fixedInstructions}`);
  });
});

function getEmail({
  from = "user@test.com",
  subject = "Test Subject",
  content = "Test content",
  replyTo,
  cc,
}: Partial<EmailForLLM> = {}): EmailForLLM {
  return {
    from,
    subject,
    content,
    ...(replyTo && { replyTo }),
    ...(cc && { cc }),
  };
}

function getUser() {
  return {
    aiModel: null,
    aiProvider: null,
    email: "user@test.com",
    aiApiKey: null,
    about: null,
  };
}
