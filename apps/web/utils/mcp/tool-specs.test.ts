import { describe, expect, it } from "vitest";
import {
  buildIntegrationArgsFromFields,
  getIntegrationActionDisplayValue,
  getIntegrationActionLabel,
  getOnlyIntegrationToolSpec,
} from "./tool-specs";

describe("getIntegrationActionLabel", () => {
  it("names the action after the tool it calls", () => {
    expect(
      getIntegrationActionLabel({
        integrationName: "todoist",
        integrationToolName: "add-tasks",
      }),
    ).toBe("Add Todoist task");
  });

  it("does not borrow another integration's label for an unknown tool", () => {
    const label = getIntegrationActionLabel({
      integrationName: "todoist",
      integrationToolName: "not-a-real-tool",
    });

    expect(label).not.toBe("Add Todoist task");
  });

  it("does not borrow a label for an unknown integration", () => {
    const label = getIntegrationActionLabel({
      integrationName: "some-future-crm",
      integrationToolName: "create-record",
    });

    expect(label).not.toBe("Add Todoist task");
  });
});

describe("getIntegrationActionDisplayValue", () => {
  it("uses the display argument declared by the tool spec", () => {
    expect(
      getIntegrationActionDisplayValue({
        integrationName: "todoist",
        integrationToolName: "add-tasks",
        integrationArgs: { content: "Review the contract" },
      }),
    ).toBe("Review the contract");
  });

  it("does not borrow display metadata for an unknown tool", () => {
    expect(
      getIntegrationActionDisplayValue({
        integrationName: "todoist",
        integrationToolName: "unknown-tool",
        integrationArgs: { content: "Review the contract" },
      }),
    ).toBeNull();
  });

  it("trims the display value and hides whitespace-only content", () => {
    expect(
      getIntegrationActionDisplayValue({
        integrationName: "todoist",
        integrationToolName: "add-tasks",
        integrationArgs: { content: "  Review the contract  " },
      }),
    ).toBe("Review the contract");
    expect(
      getIntegrationActionDisplayValue({
        integrationName: "todoist",
        integrationToolName: "add-tasks",
        integrationArgs: { content: "   " },
      }),
    ).toBeNull();
  });
});

describe("buildIntegrationArgsFromFields", () => {
  it("keeps Todoist title, description, project, and due date from flat fields", () => {
    const spec = getOnlyIntegrationToolSpec();
    expect(spec).toBeDefined();
    if (!spec) return;

    expect(
      buildIntegrationArgsFromFields({
        spec,
        fields: {
          content: "Follow up",
          description: "From the email",
          projectId: "inbox",
          dueString: "tomorrow",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        content: "Follow up",
        description: "From the email",
        projectId: "inbox",
        dueString: "tomorrow",
      }),
    );
  });
});
