import {
  getParameterFieldsForAction,
  parseTemplate,
} from "@/utils/ai/choose-rule/choose-args";
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// Run with:
// pnpm test-ai ai-choose-args.test.ts

vi.mock("server-only", () => ({}));

describe("getParameterFieldsForAction", () => {
  it("creates schema for simple field", () => {
    const action = {
      label: "{{write label}}",
      subject: "",
      content: "",
      to: "",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(result.label?.shape).toEqual({
      var1: expect.any(z.ZodString),
    });
    expect(result.label?._def.description).toBe(
      "Generate this template: {{var1: write label}}",
    );
  });

  it("creates schema for field with multiple variables", () => {
    const action = {
      label: "",
      content: "Dear {{write greeting}},\n\n{{draft response}}\n\nBest",
      subject: "",
      to: "",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(result.content?.shape).toEqual({
      var1: expect.any(z.ZodString),
      var2: expect.any(z.ZodString),
    });
    expect(result.content?._def.description).toBe(
      "Generate this template: Dear {{var1: write greeting}},\n\n{{var2: draft response}}\n\nBest\nMake sure to maintain the exact formatting.",
    );
  });

  it("ignores fields without template variables", () => {
    const action = {
      label: "Simple label",
      subject: "",
      content: "",
      to: "",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(result.label).toBeUndefined();
  });

  it("handles multiple fields with template variables", () => {
    const action = {
      label: "{{write label}}",
      subject: "Re: {{write subject}}",
      content: "{{write content}}",
      to: "{{recipient}}",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(Object.keys(result)).toHaveLength(4);
    expect(result.label?._def.description).toBe(
      "Generate this template: {{var1: write label}}",
    );
    expect(result.subject?._def.description).toBe(
      "Generate this template: Re: {{var1: write subject}}",
    );
    expect(result.to?._def.description).toBe(
      "Generate this template: {{var1: recipient}}",
    );
  });
});

describe("parseTemplate", () => {
  it("handles adjacent template variables with no gap", () => {
    const template = "start{{x}}{{y}}end";
    const result = parseTemplate(template);

    expect(result).toEqual({
      aiPrompts: ["x", "y"],
      fixedParts: ["start", "", "end"],
    });
  });

  it("handles multiple edge cases", () => {
    const cases = [
      {
        template: "{{x}}{{y}}", // No gaps, at start
        expected: {
          aiPrompts: ["x", "y"],
          fixedParts: ["", "", ""],
        },
      },
      {
        template: "{{x}}text{{y}}{{z}}", // Mixed gaps
        expected: {
          aiPrompts: ["x", "y", "z"],
          fixedParts: ["", "text", "", ""],
        },
      },
    ];

    cases.forEach(({ template, expected }) => {
      expect(parseTemplate(template)).toEqual(expected);
    });
  });

  it("handles multi-line AI prompts", () => {
    const template = `{{Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.}}`;

    const result = parseTemplate(template);

    expect(result).toEqual({
      aiPrompts: [
        `Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.`,
      ],
      fixedParts: ["", ""],
    });
  });

  it("handles multi-line AI prompts with surrounding text", () => {
    const template = `Label: {{Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.}} (Auto-generated)`;

    const result = parseTemplate(template);

    expect(result).toEqual({
      aiPrompts: [
        `Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.`,
      ],
      fixedParts: ["Label: ", " (Auto-generated)"],
    });
  });
});
