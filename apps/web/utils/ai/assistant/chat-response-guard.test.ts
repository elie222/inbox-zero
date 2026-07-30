import { describe, expect, it } from "vitest";
import {
  getFailedToolCalls,
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

  // A tool-input schema validation failure surfaces as state "output-error"
  // with no `output` at all, so the output-based checks above never see it.
  it("warns when a typed tool call is rejected with output-error", () => {
    expect(
      getToolFailureWarning({
        parts: [
          { type: "text", text: "Done! I updated the rule for you." },
          {
            type: "tool-updateRule",
            state: "output-error",
            errorText: "Invalid arguments for tool updateRule",
          },
        ],
      }),
    ).toContain("Some tool calls failed during this request.");
  });

  // The AI SDK reports an unparseable tool call as a `dynamic-tool` part
  // rather than `tool-<name>`, so a startsWith("tool-") check misses it.
  it("warns when a dynamic-tool call is rejected with output-error", () => {
    expect(
      getToolFailureWarning({
        parts: [
          {
            type: "dynamic-tool",
            toolName: "updateRule",
            state: "output-error",
            errorText: "Invalid arguments for tool updateRule",
          },
        ],
      }),
    ).toContain("Some tool calls failed during this request.");
  });

  // Tool names are not unique per target: one turn can call updateRule for two
  // different rules. Treating a later success as a repair would hide a real
  // failure behind an unrelated call that happened to work.
  it("still warns when a later call to the same tool succeeded", () => {
    expect(
      getToolFailureWarning({
        parts: [
          {
            type: "tool-updateRule",
            state: "output-error",
            errorText: "Invalid arguments for tool updateRule",
          },
          {
            type: "tool-updateRule",
            state: "output-available",
            output: { success: true },
          },
        ],
      }),
    ).toContain("Some tool calls failed during this request.");
  });

  it("warns when a later call to the same tool also failed", () => {
    expect(
      getToolFailureWarning({
        parts: [
          {
            type: "tool-updateRule",
            state: "output-available",
            output: { success: true },
          },
          {
            type: "tool-updateRule",
            state: "output-error",
            errorText: "Invalid arguments for tool updateRule",
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

describe("getFailedToolCalls", () => {
  it("names the tool and reason for each unrecovered failure", () => {
    expect(
      getFailedToolCalls({
        parts: [
          {
            type: "dynamic-tool",
            toolName: "updateRule",
            state: "output-error",
            errorText: "Invalid arguments for tool updateRule",
          },
          {
            type: "tool-manageInbox",
            state: "output-available",
            output: { error: "No sender-level action was taken." },
          },
        ],
      }),
    ).toEqual([
      {
        toolName: "updateRule",
        error: "Invalid arguments for tool updateRule",
      },
      { toolName: "manageInbox", error: "No sender-level action was taken." },
    ]);
  });

  it("reports a failure even when another call to the same tool succeeded", () => {
    expect(
      getFailedToolCalls({
        parts: [
          {
            type: "tool-updateRule",
            state: "output-error",
            errorText: "Invalid arguments",
          },
          {
            type: "tool-updateRule",
            state: "output-available",
            output: { success: true },
          },
        ],
      }),
    ).toEqual([{ toolName: "updateRule", error: "Invalid arguments" }]);
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
