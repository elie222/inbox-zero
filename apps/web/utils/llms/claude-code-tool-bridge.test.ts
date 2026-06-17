import { describe, expect, it } from "vitest";
import {
  getClaudeCodeMcpToolName,
  getOriginalClaudeCodeToolName,
  normalizeClaudeCodeToolNamesInStepResult,
  normalizeClaudeCodeToolPart,
} from "./claude-code-tool-bridge";

describe("Claude Code tool bridge helpers", () => {
  it("round-trips Claude Code MCP tool names", () => {
    expect(getClaudeCodeMcpToolName("searchInbox")).toBe(
      "mcp__inboxzero__searchInbox",
    );
    expect(getOriginalClaudeCodeToolName("mcp__inboxzero__searchInbox")).toBe(
      "searchInbox",
    );
    expect(getOriginalClaudeCodeToolName("searchInbox")).toBe("searchInbox");
  });

  it("normalizes bridged tool names in step results", () => {
    const result = normalizeClaudeCodeToolNamesInStepResult({
      steps: [
        {
          toolCalls: [
            { toolName: "mcp__inboxzero__finalizeResults", input: {} },
          ],
          toolResults: [
            { toolName: "mcp__inboxzero__finalizeResults", output: {} },
          ],
        },
      ],
      toolCalls: [{ toolName: "mcp__inboxzero__searchInbox", input: {} }],
    });

    expect(result.steps?.[0]?.toolCalls?.[0]?.toolName).toBe("finalizeResults");
    expect(result.steps?.[0]?.toolResults?.[0]?.toolName).toBe(
      "finalizeResults",
    );
    expect(result.toolCalls?.[0]?.toolName).toBe("searchInbox");
  });

  it("normalizes bridged UI tool part types", () => {
    const part = normalizeClaudeCodeToolPart({
      type: "tool-mcp__inboxzero__createRule",
      toolCallId: "call-1",
    });

    expect(part.type).toBe("tool-createRule");
  });
});
