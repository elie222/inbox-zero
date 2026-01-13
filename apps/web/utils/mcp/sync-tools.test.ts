import { describe, it, expect } from "vitest";
import { isReadOnlyTool } from "./sync-tools";

describe("isReadOnlyTool", () => {
  describe("read-only tools (should return true)", () => {
    it.each([
      // Slack read-only tools
      ["slack_v2-list-channels", "list"],
      ["slack_v2-list-users", "list"],
      ["slack_v2-list-files", "list"],
      ["slack_v2-get-file", "get"],
      ["slack_v2-get-current-user", "get"],
      ["slack_v2-find-message", "find"],
      ["slack_v2-find-user-by-email", "find"],
      // Todoist read-only tools
      ["todoist-list-projects", "list"],
      ["todoist-list-tasks", "list"],
      ["todoist-get-task", "get"],
      ["todoist-get-project", "get"],
      ["todoist-find-task", "find"],
      ["todoist-find-project", "find"],
      ["todoist-search-tasks", "search"],
      // Other patterns
      ["app-fetch-data", "fetch"],
      ["app-read-config", "read"],
      ["app-query-database", "query"],
    ])("%s (action: %s)", (toolName) => {
      expect(isReadOnlyTool(toolName)).toBe(true);
    });
  });

  describe("write tools (should return false)", () => {
    it.each([
      // Slack write tools
      ["slack_v2-send-message", "send"],
      ["slack_v2-send-message-to-channel", "send"],
      ["slack_v2-create-channel", "create"],
      ["slack_v2-delete-message", "delete"],
      ["slack_v2-update-message", "update"],
      ["slack_v2-archive-channel", "archive"],
      ["slack_v2-invite-user-to-channel", "invite"],
      ["slack_v2-kick-user", "kick"],
      ["slack_v2-set-status", "set"],
      ["slack_v2-upload-file", "upload"],
      ["slack_v2-add-emoji-reaction", "add"],
      ["slack_v2-reply-to-a-message", "reply"],
      // Todoist write tools
      ["todoist-create-task", "create"],
      ["todoist-delete-task", "delete"],
      ["todoist-update-task", "update"],
      ["todoist-mark-task-completed", "mark"],
      ["todoist-move-task-to-section", "move"],
      ["todoist-import-tasks", "import"],
      ["todoist-export-tasks", "export"],
      ["todoist-uncomplete-task", "uncomplete"],
    ])("%s (action: %s)", (toolName) => {
      expect(isReadOnlyTool(toolName)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for single-segment names (no hyphen)", () => {
      expect(isReadOnlyTool("noaction")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isReadOnlyTool("")).toBe(false);
    });

    it("handles case insensitivity", () => {
      expect(isReadOnlyTool("APP-LIST-items")).toBe(true);
      expect(isReadOnlyTool("APP-GET-data")).toBe(true);
      expect(isReadOnlyTool("APP-CREATE-item")).toBe(false);
    });

    it("handles tools with multiple hyphens", () => {
      expect(isReadOnlyTool("slack_v2-list-group-members")).toBe(true);
      expect(isReadOnlyTool("slack_v2-send-message-to-user-or-group")).toBe(
        false,
      );
    });
  });
});
