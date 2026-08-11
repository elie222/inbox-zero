import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { isReadOnlyTool, syncMcpTools } from "./sync-tools";

const { mockListMcpTools } = vi.hoisted(() => ({
  mockListMcpTools: vi.fn(),
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/mcp/list-tools", () => ({
  listMcpTools: mockListMcpTools,
}));

describe("syncMcpTools", () => {
  const logger = createScopedLogger("sync-tools-test");

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockResolvedValue([]);
  });

  function mockConnection(
    existingTools: { name: string; isEnabled: boolean }[],
    integrationName = "notion",
  ) {
    prisma.mcpConnection.findFirst.mockResolvedValue({
      id: "connection-1",
      integration: { id: "integration-1", name: integrationName },
      tools: existingTools,
    } as unknown as Awaited<ReturnType<typeof prisma.mcpConnection.findFirst>>);
  }

  it("preserves the user's enable/disable choices for existing tools", async () => {
    mockConnection([{ name: "notion-search", isEnabled: false }]);
    mockListMcpTools.mockResolvedValue([
      { name: "notion-search", description: "search" },
      { name: "notion-fetch", description: "fetch" },
    ]);

    await syncMcpTools("notion", "email-account-1", logger);

    expect(prisma.mcpTool.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ name: "notion-search", isEnabled: false }),
        expect.objectContaining({ name: "notion-fetch", isEnabled: true }),
      ],
    });
  });

  it("only syncs Pipedream tools that both declare and look read-only", async () => {
    mockConnection([], "pipedream");
    mockListMcpTools.mockResolvedValue([
      { name: "slack_v2-list-channels" },
      { name: "slack_v2-list-users", readOnlyHint: true },
      { name: "slack_v2-send-message", readOnlyHint: true },
      { name: "custom_read_tool", readOnlyHint: true },
      { name: "app-list-archived-items", readOnlyHint: false },
    ]);

    await syncMcpTools("pipedream", "email-account-1", logger);

    expect(prisma.mcpTool.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: "slack_v2-list-users",
          isEnabled: false,
        }),
      ],
    });
  });

  it("preserves explicitly enabled Pipedream tools during resync", async () => {
    mockConnection(
      [{ name: "slack_v2-list-users", isEnabled: true }],
      "pipedream",
    );
    mockListMcpTools.mockResolvedValue([
      { name: "slack_v2-list-users", readOnlyHint: true },
    ]);

    await syncMcpTools("pipedream", "email-account-1", logger);

    expect(prisma.mcpTool.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: "slack_v2-list-users",
          isEnabled: true,
        }),
      ],
    });
  });

  it("throws for unknown integrations", async () => {
    await expect(
      syncMcpTools("unknown-integration", "email-account-1", logger),
    ).rejects.toThrow("Unknown integration");
  });

  it("syncs configured write tools with isWrite and no read tools for todoist", async () => {
    mockConnection([], "todoist");
    mockListMcpTools.mockResolvedValue([
      { name: "add-tasks", description: "add tasks" },
      { name: "find-tasks", description: "find tasks" },
      { name: "find-projects", description: "find projects" },
    ]);

    await syncMcpTools("todoist", "email-account-1", logger);

    expect(prisma.mcpTool.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: "add-tasks",
          isWrite: true,
          isEnabled: true,
        }),
      ],
    });
  });

  it("keeps read tools isWrite false", async () => {
    mockConnection([]);
    mockListMcpTools.mockResolvedValue([
      { name: "notion-search", description: "search" },
    ]);

    await syncMcpTools("notion", "email-account-1", logger);

    expect(prisma.mcpTool.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ name: "notion-search", isWrite: false }),
      ],
    });
  });
});

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
