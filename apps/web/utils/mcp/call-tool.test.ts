import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCallTool,
  mockClientClose,
  mockClientConnect,
  mockGetAuthToken,
  mockTransportClose,
} = vi.hoisted(() => ({
  mockCallTool: vi.fn(),
  mockClientClose: vi.fn(),
  mockClientConnect: vi.fn(),
  mockGetAuthToken: vi.fn(),
  mockTransportClose: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = mockClientConnect;
    callTool = mockCallTool;
    close = mockClientClose;
  },
}));

vi.mock("@/utils/mcp/oauth", () => ({
  getAuthToken: mockGetAuthToken,
}));

vi.mock("@/utils/mcp/transport", () => ({
  createMcpTransport: () => ({ close: mockTransportClose }),
}));

import { callMcpTool } from "@/utils/mcp/call-tool";

describe("callMcpTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthToken.mockResolvedValue("token");
  });

  it("does not expose remote tool error content", async () => {
    mockCallTool.mockResolvedValue({
      isError: true,
      content: [
        {
          type: "text",
          text: "Task title copied from a private email",
        },
      ],
    });

    const error = await callMcpTool({
      emailAccountId: "email-account-1",
      integration: "todoist",
      toolName: "add-tasks",
      args: { content: "private task" },
    }).catch((caught) => caught);

    expect(error).toEqual(new Error("Failed to call todoist tool add-tasks"));
    expect(error.message).not.toContain("private email");
    expect(mockClientClose).toHaveBeenCalledOnce();
    expect(mockTransportClose).toHaveBeenCalledOnce();
  });
});
