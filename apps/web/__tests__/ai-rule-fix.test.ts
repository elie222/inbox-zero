import { describe, expect, test, vi } from "vitest";
import stripIndent from "strip-indent";
import { aiRuleFix } from "@/utils/ai/rule/rule-fix";
import { getEmail, getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai ai-rule-fix

const isAiTest = process.env.RUN_AI_TESTS === "true";

vi.mock("server-only", () => ({}));

describe.runIf(isAiTest)("aiRuleFix", () => {
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
      actualRule: rule,
      expectedRule: null,
      email: salesEmail,
      emailAccount: getEmailAccount(),
    });

    console.log(result);

    expect(result).toBeDefined();
    expect(result.ruleToFix).toBe("actual_rule");
    expect(result.fixedInstructions).toContain("sales");
    expect(result.fixedInstructions).not.toBe(rule.instructions);
    // The new instructions should be more specific to exclude sales pitches
    expect(result.fixedInstructions.toLowerCase()).toMatch(
      /(apply|match).*(partnership|collaboration).*(not|but do not|excluding).*(sales|promotion|discount)/i,
    );
  });

  test("should fix rules when email matched wrong rule instead of correct rule", async () => {
    const actualRule = {
      instructions: "Match emails about technical support and bug reports",
    };
    const expectedRule = {
      instructions: "Match emails about product feedback and feature requests",
    };

    const feedbackEmail = getEmail({
      subject: "Feature Suggestion",
      content: stripIndent(`
        Hello,

        I love your product and have a suggestion for improvement.
        It would be great if you could add dark mode to the dashboard.

        Thanks,
        Sarah
      `),
    });

    const result = await aiRuleFix({
      actualRule,
      expectedRule,
      email: feedbackEmail,
      emailAccount: getEmailAccount(),
    });

    console.log(result);

    expect(result).toBeDefined();
    expect(result.ruleToFix).toBe("expected_rule");
    expect(result.fixedInstructions).toContain("technical");
    // The incorrect rule should be more specific to exclude feature requests
    expect(result.fixedInstructions.toLowerCase()).toMatch(
      /(technical|support|bug).*(issues|problems|reports)/i,
    );
  });

  test("should fix rule when email matched but shouldn't match any rules", async () => {
    const actualRule = {
      instructions: "Match emails about marketing collaborations",
    };

    const newsletterEmail = getEmail({
      subject: "Weekly Marketing Newsletter",
      content: stripIndent(`
        This Week in Marketing:
        
        - Top 10 Marketing Trends
        - Latest Industry News
        - Upcoming Webinars
        
        To unsubscribe, click here.
      `),
    });

    const result = await aiRuleFix({
      actualRule,
      expectedRule: null,
      email: newsletterEmail,
      emailAccount: getEmailAccount(),
    });

    console.log(result);

    expect(result).toBeDefined();
    expect(result.ruleToFix).toBe("actual_rule");
    expect(result.fixedInstructions).toContain("collaboration");
    // The fixed rule should exclude newsletters and automated updates
    expect(result.fixedInstructions.toLowerCase()).toMatch(
      /(collaboration|partnership).*(not|exclude).*(newsletter|automated|digest)/i,
    );
  });

  test("should fix rule when email should have matched but didn't", async () => {
    const correctRule = {
      instructions: "Match emails requesting pricing information",
    };

    const priceRequestEmail = getEmail({
      subject: "Pricing Question",
      content: stripIndent(`
        Hi there,

        Could you please send me information about your enterprise pricing?
        We're looking to implement your solution for our team of 50 people.

        Best regards,
        Michael
      `),
    });

    const result = await aiRuleFix({
      actualRule: null,
      expectedRule: correctRule,
      email: priceRequestEmail,
      emailAccount: getEmailAccount(),
    });

    console.log(result);

    expect(result).toBeDefined();
    expect(result.ruleToFix).toBe("expected_rule");
    expect(result.fixedInstructions).toContain("pric");
    // The fixed rule should be more inclusive of various pricing inquiries
    expect(result.fixedInstructions.toLowerCase()).toMatch(
      /(price|pricing|cost|quote).*(request|inquiry|information)/i,
    );
  });
});
