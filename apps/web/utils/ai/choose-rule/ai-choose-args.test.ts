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

    expect(result.label).toBeDefined();
    expect(result.label?.shape).toEqual({
      var1: expect.any(z.ZodString),
    });
    // Description exists and contains the template
    const description =
      (result.label as any)?.description ||
      (result.label as any)?._def?.description;
    expect(description).toContain("{{var1: write label}}");
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

    expect(result.content).toBeDefined();
    expect(result.content?.shape).toEqual({
      var1: expect.any(z.ZodString),
      var2: expect.any(z.ZodString),
    });
    // Description exists and contains the template variables
    const description =
      (result.content as any)?.description ||
      (result.content as any)?._def?.description;
    expect(description).toContain("{{var1: write greeting}}");
    expect(description).toContain("{{var2: draft response}}");
    expect(description).toContain("maintain the exact formatting");
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

    // Check label field
    expect(result.label).toBeDefined();
    const labelDesc =
      (result.label as any)?.description ||
      (result.label as any)?._def?.description;
    expect(labelDesc).toContain("{{var1: write label}}");

    // Check subject field
    expect(result.subject).toBeDefined();
    const subjectDesc =
      (result.subject as any)?.description ||
      (result.subject as any)?._def?.description;
    expect(subjectDesc).toContain("Re: {{var1: write subject}}");

    // Check to field
    expect(result.to).toBeDefined();
    const toDesc =
      (result.to as any)?.description || (result.to as any)?._def?.description;
    expect(toDesc).toContain("{{var1: recipient}}");
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
