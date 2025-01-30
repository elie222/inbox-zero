import { describe, it, expect, vi } from "vitest";
import { getRiskLevel, getActionRiskLevel } from "./risk";
import { ActionType } from "@prisma/client";
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
