import { describe, expect, it } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import {
  buildThreadStatusSystemPrompt,
  getConversationStatusDefinitions,
} from "./determine-thread-status";
import { getRuleConfig } from "@/utils/rule/consts";
import type { RuleWithActions } from "@/utils/types";

function rule(
  systemType: SystemType,
  instructions: string | null,
  enabled = true,
): RuleWithActions {
  return { systemType, instructions, enabled } as RuleWithActions;
}

describe("getConversationStatusDefinitions", () => {
  it("uses the default instructions when no rules are supplied", () => {
    const definitions = getConversationStatusDefinitions([]);
    expect(definitions.map((d) => d.systemType)).toEqual([
      SystemType.TO_REPLY,
      SystemType.AWAITING_REPLY,
      SystemType.FYI,
      SystemType.ACTIONED,
    ]);
    for (const definition of definitions) {
      expect(definition.instructions).toBe(
        getRuleConfig(definition.systemType).instructions,
      );
    }
  });

  it("treats a rule still holding a previous default as default", () => {
    const definitions = getConversationStatusDefinitions([
      rule(
        SystemType.FYI,
        "Important emails I should know about, but don't need to reply to",
      ),
    ]);
    expect(
      definitions.find((d) => d.systemType === SystemType.FYI)?.instructions,
    ).toBe(getRuleConfig(SystemType.FYI).instructions);
  });

  it("uses the user's own instructions when they edited the rule", () => {
    const definitions = getConversationStatusDefinitions([
      rule(SystemType.FYI, "Anything from my accountant"),
    ]);
    expect(
      definitions.find((d) => d.systemType === SystemType.FYI)?.instructions,
    ).toBe("Anything from my accountant");
  });

  it("ignores disabled rules and empty instructions", () => {
    const definitions = getConversationStatusDefinitions([
      rule(SystemType.FYI, "Anything from my accountant", false),
      rule(SystemType.ACTIONED, ""),
    ]);
    expect(
      definitions.find((d) => d.systemType === SystemType.FYI)?.instructions,
    ).toBe(getRuleConfig(SystemType.FYI).instructions);
    expect(
      definitions.find((d) => d.systemType === SystemType.ACTIONED)
        ?.instructions,
    ).toBe(getRuleConfig(SystemType.ACTIONED).instructions);
  });

  it("omits FYI when asked for a subset", () => {
    const definitions = getConversationStatusDefinitions(
      [],
      [SystemType.TO_REPLY, SystemType.AWAITING_REPLY, SystemType.ACTIONED],
    );
    expect(definitions.map((d) => d.systemType)).not.toContain(SystemType.FYI);
  });
});

describe("buildThreadStatusSystemPrompt", () => {
  it("states the default FYI boundary when FYI is on the default definition", () => {
    const prompt = buildThreadStatusSystemPrompt({
      definitions: getConversationStatusDefinitions([]),
      userSentLastEmail: false,
    });
    expect(prompt).toContain(
      `* FYI - ${getRuleConfig(SystemType.FYI).instructions}`,
    );
    expect(prompt).toContain(
      "status: One of TO_REPLY, AWAITING_REPLY, FYI, ACTIONED",
    );
  });

  it("defers to a custom FYI definition instead of redefining it", () => {
    const prompt = buildThreadStatusSystemPrompt({
      definitions: getConversationStatusDefinitions([
        rule(SystemType.FYI, "Anything from my accountant"),
      ]),
      userSentLastEmail: false,
    });
    expect(prompt).toContain("* FYI - Anything from my accountant");
    expect(prompt).not.toContain("nothing was ever asked");
  });

  it("removes FYI entirely when the user sent the last email", () => {
    const prompt = buildThreadStatusSystemPrompt({
      definitions: getConversationStatusDefinitions(
        [],
        [SystemType.TO_REPLY, SystemType.AWAITING_REPLY, SystemType.ACTIONED],
      ),
      userSentLastEmail: true,
    });
    expect(prompt).not.toContain("* FYI");
    expect(prompt).toContain(
      "status: One of TO_REPLY, AWAITING_REPLY, ACTIONED",
    );
  });
});
