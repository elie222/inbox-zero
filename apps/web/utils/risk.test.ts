import { describe, it, expect, vi } from "vitest";
import {
  getRiskLevel,
  getActionRiskLevel,
  isFullyDynamicField,
  isPartiallyDynamicField,
} from "./risk";
import { ActionType } from "@/generated/prisma";
import type { RulesResponse } from "@/app/api/user/rules/route";

// Run with:
// pnpm test risk.test.ts

vi.mock("server-only", () => ({}));

describe("getActionRiskLevel", () => {
  const testCases = [
    {
      name: "returns very-high risk for fully dynamic content and recipient with automation",
      action: {
        subject: "{{dynamic}}",
        content: "{{dynamic}}",
        to: "{{dynamic}}",
        cc: "",
        bcc: "",
        type: ActionType.REPLY,
      },
      hasAutomation: true,
      instructions: "String",
      expectedLevel: "very-high",
      expectedMessageContains: "Very High Risk",
    },
    {
      name: "returns high risk for fully dynamic recipient with automation",
      action: {
        subject: "",
        content: "",
        to: "{{dynamic}}",
        cc: "",
        bcc: "",
        type: ActionType.REPLY,
      },
      hasAutomation: true,
      instructions: "String",
      expectedLevel: "high",
      expectedMessageContains: "High Risk",
    },
    {
      name: "returns medium risk for partially dynamic content with automation",
      action: {
        subject: "Hello {{name}}",
        content: "How are you {{name}}?",
        to: "static@example.com",
        cc: "",
        bcc: "",
        type: ActionType.REPLY,
      },
      hasAutomation: true,
      instructions: "String",
      expectedLevel: "medium",
      expectedMessageContains: "Medium Risk",
    },
    {
      name: "returns low risk for static content and recipient",
      action: {
        subject: "Static Subject",
        content: "Static Content",
        to: "static@example.com",
        cc: "",
        bcc: "",
        type: ActionType.REPLY,
      },
      hasAutomation: false,
      instructions: "String",
      expectedLevel: "low",
      expectedMessageContains: "Low Risk",
    },
    {
      name: "returns medium risk for dynamic recipient without automation",
      action: {
        subject: "Static Subject",
        content: "Static Content",
        to: "{{dynamic}}",
        cc: "",
        bcc: "",
        type: ActionType.REPLY,
      },
      hasAutomation: false,
      instructions: "String",
      expectedLevel: "low",
      expectedMessageContains: "Low Risk",
    },
    {
      name: "returns medium risk for dynamic cc/bcc without automation",
      action: {
        subject: "Static Subject",
        content: "Static Content",
        to: "static@example.com",
        cc: "{{dynamic}}",
        bcc: "",
        type: ActionType.REPLY,
      },
      hasAutomation: false,
      instructions: "String",
      expectedLevel: "low",
      expectedMessageContains: "Low Risk",
    },
  ];

  testCases.forEach(
    ({
      name,
      action,
      hasAutomation,
      instructions,
      expectedLevel,
      expectedMessageContains,
    }) => {
      it(name, () => {
        const result = getActionRiskLevel(action, hasAutomation, {
          instructions,
        });
        expect(result.level).toBe(expectedLevel);
        expect(result.message).toContain(expectedMessageContains);
      });
    },
  );
});

describe("getRiskLevel", () => {
  const getRiskLevelTests = [
    {
      name: "returns the highest risk level among actions",
      rule: {
        actions: [
          {
            subject: "{{dynamic}}",
            content: "Static Content",
            to: "static@example.com",
            cc: "",
            bcc: "",
            type: ActionType.REPLY,
          },
          {
            subject: "Static Subject",
            content: "Static Content",
            to: "{{dynamic}}",
            cc: "",
            bcc: "",
            type: ActionType.REPLY,
          },
        ],
        automate: true,
        instructions: "String",
      } as RulesResponse[number],
      expectedLevel: "high",
      expectedMessageContains: "High Risk",
    },
    {
      name: "returns high risk when one action is high and another is low",
      rule: {
        actions: [
          {
            subject: "{{dynamic}}",
            content: "Static Content",
            to: "static@example.com",
            cc: "",
            bcc: "",
            type: ActionType.REPLY,
          },
          {
            subject: "Static Subject",
            content: "Static Content",
            to: "static@example.com",
            cc: "",
            bcc: "",
            type: ActionType.REPLY,
          },
        ],
        automate: true,
        instructions: "String",
      } as RulesResponse[number],
      expectedLevel: "high",
      expectedMessageContains: "High Risk",
    },
    {
      name: "returns low risk when all actions are low risk",
      rule: {
        actions: [
          {
            subject: "Static Subject",
            content: "Static Content",
            to: "static@example.com",
            cc: "",
            bcc: "",
            type: ActionType.REPLY,
          },
          {
            subject: "Another Static Subject",
            content: "Another Static Content",
            to: "another@example.com",
            cc: "",
            bcc: "",
            type: ActionType.REPLY,
          },
        ],
        automate: false,
        instructions: "String",
      } as RulesResponse[number],
      expectedLevel: "low",
      expectedMessageContains: "Low Risk",
    },
  ];

  getRiskLevelTests.forEach(
    ({ name, rule, expectedLevel, expectedMessageContains }) => {
      it(name, () => {
        const result = getRiskLevel(rule);
        expect(result.level).toBe(expectedLevel);
        expect(result.message).toContain(expectedMessageContains);
      });
    },
  );
});

describe("isFullyDynamicField", () => {
  const testCases = [
    {
      name: "returns true for single-line template variable",
      field: "{{name}}",
      expected: true,
    },
    {
      name: "returns true for multi-line template variable",
      field: `{{
tell a funny joke.
do it in the language of the questioner.
always start with "Here's a great joke:"
}}`,
      expected: true,
    },
    {
      name: "returns true for template variable with spaces",
      field: "{{ write a greeting }}",
      expected: true,
    },
    {
      name: "returns false for partially dynamic field",
      field: "Hello {{name}}",
      expected: false,
    },
    {
      name: "returns false for static field",
      field: "Static content",
      expected: false,
    },
    {
      name: "returns false for empty string",
      field: "",
      expected: false,
    },
    {
      name: "returns true for field with multiple template variables (starts and ends with braces)",
      field: "{{greeting}} {{name}}",
      expected: true,
    },
    {
      name: "returns true for complex multi-line template",
      field: `{{
Generate a personalized response that:
1. Acknowledges their request
2. Provides helpful information
3. Maintains a professional tone
}}`,
      expected: true,
    },
  ];

  testCases.forEach(({ name, field, expected }) => {
    it(name, () => {
      expect(isFullyDynamicField(field)).toBe(expected);
    });
  });
});

describe("isPartiallyDynamicField", () => {
  const testCases = [
    {
      name: "returns true for single-line template variable",
      field: "{{name}}",
      expected: true,
    },
    {
      name: "returns true for multi-line template variable",
      field: `{{
tell a funny joke.
do it in the language of the questioner.
always start with "Here's a great joke:"
}}`,
      expected: true,
    },
    {
      name: "returns true for partially dynamic field",
      field: "Hello {{name}}",
      expected: true,
    },
    {
      name: "returns true for field with multiple template variables",
      field: "{{greeting}} {{name}}",
      expected: true,
    },
    {
      name: "returns true for mixed content with multi-line template",
      field: `Hi {{name}}!

{{
Please write a personalized response based on:
- Their previous interactions
- Their current needs
- Our company policies
}}

Best regards`,
      expected: true,
    },
    {
      name: "returns false for static field",
      field: "Static content",
      expected: false,
    },
    {
      name: "returns false for empty string",
      field: "",
      expected: false,
    },
    {
      name: "returns false for field with only curly braces (no double)",
      field: "Hello {name}",
      expected: false,
    },
    {
      name: "returns false for field with malformed template syntax",
      field: "Hello {{name}",
      expected: false,
    },
  ];

  testCases.forEach(({ name, field, expected }) => {
    it(name, () => {
      expect(isPartiallyDynamicField(field)).toBe(expected);
    });
  });
});
