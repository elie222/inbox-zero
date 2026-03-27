import { describe, expect, it } from "vitest";
import { getToolFailureWarning } from "./chat-response-guard";

describe("getToolFailureWarning", () => {
  it("returns null when there are no tool errors", () => {
    expect(
      getToolFailureWarning({
        parts: [{ type: "text", text: "Done. I archived those threads." }],
      }),
    ).toBeNull();
  });

  it("returns a warning when tool errors are present but not acknowledged", () => {
    expect(
      getToolFailureWarning({
        parts: [
          { type: "text", text: "Done! I updated the rule for you." },
          {
            type: "tool-updateRuleConditions",
            state: "output-available",
            output: {
              error:
                "No rule was changed. Call getUserRulesAndSettings immediately before updating this rule.",
            },
          },
        ],
      }),
    ).toContain("Some tool calls failed during this request.");
  });

  it("still adds a warning when the assistant already acknowledges the failure", () => {
    expect(
      getToolFailureWarning({
        parts: [
          {
            type: "text",
            text: "I could not update that rule. Nothing changed because the rule details were stale.",
          },
          {
            type: "tool-updateRuleConditions",
            state: "output-available",
            output: {
              error:
                "No rule was changed. Call getUserRulesAndSettings immediately before updating this rule.",
            },
          },
        ],
      }),
    ).toContain("Some tool calls failed during this request.");
  });

  it("does not depend on the assistant's wording", () => {
    expect(
      getToolFailureWarning({
        parts: [
          {
            type: "text",
            text: "Done. I saw an error earlier, but here is the summary.",
          },
          {
            type: "tool-manageInbox",
            state: "output-available",
            output: {
              error:
                'No sender-level action was taken. "fromEmails" is required for bulk_archive_senders and unsubscribe_senders.',
            },
          },
        ],
      }),
    ).toContain("Some tool calls failed during this request.");
  });
});
