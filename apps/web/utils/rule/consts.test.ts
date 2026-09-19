import { describe, expect, it } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import {
  getEffectiveRuleInstructions,
  getRuleConfig,
} from "@/utils/rule/consts";

const receiptDefault = getRuleConfig(SystemType.RECEIPT).instructions;
const previousReceiptDefault =
  "Receipts: Purchase confirmations, payment receipts, transaction records or invoices";

describe("getEffectiveRuleInstructions", () => {
  it("returns the current default when the rule stores it", () => {
    expect(
      getEffectiveRuleInstructions({
        systemType: SystemType.RECEIPT,
        instructions: receiptDefault,
      }),
    ).toBe(receiptDefault);
  });

  it("returns the current default when the rule stores a previous default", () => {
    expect(receiptDefault).not.toBe(previousReceiptDefault);
    expect(
      getEffectiveRuleInstructions({
        systemType: SystemType.RECEIPT,
        instructions: previousReceiptDefault,
      }),
    ).toBe(receiptDefault);
  });

  it("resolves every previous default to the current default", () => {
    for (const systemType of Object.values(SystemType)) {
      const config = getRuleConfig(systemType);
      for (const previous of config.previousInstructions ?? []) {
        expect(
          getEffectiveRuleInstructions({ systemType, instructions: previous }),
        ).toBe(config.instructions);
      }
    }
  });

  it("keeps customised instructions on a system rule", () => {
    const custom = `${previousReceiptDefault}, but not refunds`;
    expect(
      getEffectiveRuleInstructions({
        systemType: SystemType.RECEIPT,
        instructions: custom,
      }),
    ).toBe(custom);
  });

  it.each([
    null,
    undefined,
    "",
  ])("returns the default when a system rule stores %j", (instructions) => {
    expect(
      getEffectiveRuleInstructions({
        systemType: SystemType.RECEIPT,
        instructions,
      }),
    ).toBe(receiptDefault);
  });

  it("leaves rules without a system type untouched", () => {
    expect(
      getEffectiveRuleInstructions({
        systemType: null,
        instructions: previousReceiptDefault,
      }),
    ).toBe(previousReceiptDefault);
    expect(
      getEffectiveRuleInstructions({ systemType: null, instructions: null }),
    ).toBeNull();
  });

  it("does not change cold email instructions", () => {
    expect(
      getEffectiveRuleInstructions({
        systemType: SystemType.COLD_EMAIL,
        instructions: DEFAULT_COLD_EMAIL_PROMPT,
      }),
    ).toBe(DEFAULT_COLD_EMAIL_PROMPT);
    expect(
      getEffectiveRuleInstructions({
        systemType: SystemType.COLD_EMAIL,
        instructions: "Only flag recruiters",
      }),
    ).toBe("Only flag recruiters");
  });
});
