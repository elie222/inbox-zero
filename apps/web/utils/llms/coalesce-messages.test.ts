import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { coalesceConsecutiveMessages } from "./coalesce-messages";

describe("coalesceConsecutiveMessages", () => {
  it("returns empty or single-message array unchanged", () => {
    expect(coalesceConsecutiveMessages([])).toEqual([]);

    const single: ModelMessage = { role: "user", content: "Hello" };
    expect(coalesceConsecutiveMessages([single])).toEqual([single]);
  });

  it("leaves already alternating messages unchanged", () => {
    const alternating: ModelMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is 2+2?" },
      { role: "assistant", content: "4" },
      { role: "user", content: "And 3+3?" },
    ];

    expect(coalesceConsecutiveMessages(alternating)).toEqual(alternating);
  });

  it("coalesces consecutive user messages into a single message with double newline", () => {
    const input: ModelMessage[] = [
      { role: "system", content: "System instructions" },
      { role: "user", content: "First part" },
      { role: "user", content: "Second part" },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toEqual([
      { role: "system", content: "System instructions" },
      { role: "user", content: "First part\n\nSecond part" },
    ]);
  });

  it("coalesces multiple consecutive user messages from automated context and user prompt (Issue #4648)", () => {
    const input: ModelMessage[] = [
      { role: "system", content: "You are the Inbox Zero assistant." },
      {
        role: "user",
        content:
          "[Automated context — not a message from the user] User timezone: UTC. Current timestamp: 2026-11-16T20:26:13Z.",
      },
      {
        role: "user",
        content: "[Inbox snapshot] Total emails: 100, unread: 5.",
      },
      {
        role: "user",
        content:
          "The user is viewing this email in the mail client.\nMessage ID: msg_123",
      },
      {
        role: "user",
        content: "reanalyse the tags on this email",
      },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: "system",
      content: "You are the Inbox Zero assistant.",
    });
    expect(result[1].role).toBe("user");
    expect(result[1].content).toBe(
      "[Automated context — not a message from the user] User timezone: UTC. Current timestamp: 2026-11-16T20:26:13Z.\n\n" +
        "[Inbox snapshot] Total emails: 100, unread: 5.\n\n" +
        "The user is viewing this email in the mail client.\nMessage ID: msg_123\n\n" +
        "reanalyse the tags on this email",
    );
  });

  it("handles empty strings without adding extra newlines", () => {
    const input: ModelMessage[] = [
      { role: "user", content: "" },
      { role: "user", content: "Hello" },
      { role: "user", content: "" },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("coalesces consecutive system messages", () => {
    const input: ModelMessage[] = [
      { role: "system", content: "Instruction A" },
      { role: "system", content: "Instruction B" },
      { role: "user", content: "Hi" },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toEqual([
      { role: "system", content: "Instruction A\n\nInstruction B" },
      { role: "user", content: "Hi" },
    ]);
  });

  it("coalesces consecutive assistant messages", () => {
    const input: ModelMessage[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "assistant", content: "How can I help you today?" },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!\n\nHow can I help you today?" },
    ]);
  });

  it("coalesces consecutive tool messages by combining tool result parts", () => {
    const input: ModelMessage[] = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "readEmail",
            output: { type: "json", value: { id: "1" } },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_2",
            toolName: "searchInbox",
            output: { type: "json", value: { count: 3 } },
          },
        ],
      },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("tool");
    expect(result[0].content).toHaveLength(2);
  });

  it("merges string content with array-of-parts content", () => {
    const input: ModelMessage[] = [
      { role: "user", content: "Check this image:" },
      {
        role: "user",
        content: [
          {
            type: "image",
            image: "https://example.com/image.png",
          },
        ],
      },
      { role: "user", content: "What do you see?" },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toEqual([
      { type: "text", text: "Check this image:" },
      { type: "image", image: "https://example.com/image.png" },
      { type: "text", text: "What do you see?" },
    ]);
  });

  it("merges providerOptions preserving cache control and custom options", () => {
    const input: ModelMessage[] = [
      {
        role: "user",
        content: "Context prefix",
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
          openai: { promptCacheKey: "key_1" },
        },
      },
      {
        role: "user",
        content: "User prompt",
        providerOptions: {
          customProvider: { customSetting: true },
        },
      },
    ];

    const result = coalesceConsecutiveMessages(input);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Context prefix\n\nUser prompt");
    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
      openai: { promptCacheKey: "key_1" },
      customProvider: { customSetting: true },
    });
  });
});
