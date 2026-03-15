import { describe, expect, it } from "vitest";
import { getAction, getRule } from "@/__tests__/helpers";
import { ActionType } from "@/generated/prisma/enums";
import { mapRulesToExtensionTabs } from "./mapRulesToExtensionTabs";

describe("mapRulesToExtensionTabs", () => {
  it("maps extension-supported labels to built-in tabs", () => {
    const rules = [
      getRule("sync github", [getAction({ label: "GitHub" })]),
      getRule("sync team", [getAction({ label: "Team" })]),
      getRule("sync stripe", [getAction({ label: "Stripe" })]),
    ];

    expect(mapRulesToExtensionTabs(rules)).toEqual([
      {
        type: "enable_default",
        tabId: "team",
        displayLabel: "Team",
      },
      {
        type: "enable_default",
        tabId: "github",
        displayLabel: "GitHub",
      },
      {
        type: "enable_default",
        tabId: "stripe",
        displayLabel: "Stripe",
      },
    ]);
  });

  it("keeps unsupported labels as custom tabs", () => {
    const rules = [getRule("sync travel", [getAction({ label: " Travel " })])];

    expect(mapRulesToExtensionTabs(rules)).toEqual([
      {
        type: "add_custom",
        label: "Travel",
        icon: "🏷️",
        query: "in:inbox label:travel",
        displayLabel: "Travel",
      },
    ]);
  });

  it("normalizes built-in labels before lookup and dedupe", () => {
    const rules = [
      getRule("sync lowercase team", [getAction({ label: " team " })]),
      getRule("skip duplicate team", [getAction({ label: "TEAM" })]),
    ];

    expect(mapRulesToExtensionTabs(rules)).toEqual([
      {
        type: "enable_default",
        tabId: "team",
        displayLabel: "Team",
      },
    ]);
  });

  it("skips labels for archived rules", () => {
    const rules = [
      getRule("archive newsletters", [
        getAction({ label: "Newsletter" }),
        getAction({ type: ActionType.ARCHIVE }),
      ]),
      getRule("keep github visible", [getAction({ label: "GitHub" })]),
    ];

    expect(mapRulesToExtensionTabs(rules)).toEqual([
      {
        type: "enable_default",
        tabId: "github",
        displayLabel: "GitHub",
      },
    ]);
  });
});
