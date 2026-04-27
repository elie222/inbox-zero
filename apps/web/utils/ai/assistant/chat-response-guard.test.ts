import { describe, expect, it } from "vitest";
import {
  getToolFailureWarning,
  getUserVisibleToolFailureMessage,
} from "./chat-response-guard";
import { hideToolErrorFromUser } from "./tool-error-visibility";

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
              error: "Failed to update rule conditions",
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
              error: "Failed to update rule conditions",
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

  it("does not warn for internal corrective tool errors", () => {
    expect(
      getToolFailureWarning({
        parts: [
          {
            type: "tool-manageInbox",
            state: "output-available",
            output: hideToolErrorFromUser({
              error:
                'Label "Security" does not exist. Use createOrGetLabel first if you want to create it.',
            }),
          },
          {
            type: "tool-updateRuleConditions",
            state: "output-available",
            output: hideToolErrorFromUser({
              success: false,
              error:
                "No rule was changed. Call getUserRulesAndSettings immediately before updating this rule.",
            }),
          },
        ],
      }),
    ).toBeNull();
  });
});

describe("getUserVisibleToolFailureMessage", () => {
  it("hides tool errors marked as internal", () => {
    expect(
      getUserVisibleToolFailureMessage(
        hideToolErrorFromUser({
          error:
            'Label "Security" does not exist. Use createOrGetLabel first if you want to create it.',
        }),
      ),
    ).toBeNull();
  });

  it("returns unmarked label creation instructions", () => {
    expect(
      getUserVisibleToolFailureMessage({
        error:
          'Label "Security" does not exist. Use createOrGetLabel first if you want to create it.',
      }),
    ).toBe(
      'Label "Security" does not exist. Use createOrGetLabel first if you want to create it.',
    );
  });

  it("returns real failure messages", () => {
    expect(
      getUserVisibleToolFailureMessage({
        success: false,
        error: "Failed to update emails",
      }),
    ).toBe("Failed to update emails");
  });
});
