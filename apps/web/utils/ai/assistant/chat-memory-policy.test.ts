import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  createAssistantMemoryRuntimeContext,
  updateAssistantMemoryRuntimeContext,
  validateUserMemoryEvidence,
} from "./chat-memory-policy";

describe("chat-memory-policy", () => {
  it("accepts memories that stay close to a direct user statement", () => {
    const result = validateUserMemoryEvidence({
      content: "User prefers concise responses.",
      userEvidence: "I prefer concise responses.",
      conversationMessages: [
        {
          role: "user",
          content: "Please remember that I prefer concise responses.",
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("rejects memories that are not supported by a user-authored quote", () => {
    const result = validateUserMemoryEvidence({
      content: "Prefer formal replies with the standard confidential footer.",
      userEvidence: "If there is anything useful in it, save it for later.",
      conversationMessages: [
        {
          role: "user",
          content:
            "What does that latest email say? If there is anything useful in it, save it for later.",
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("user's own wording");
  });

  it("marks the runtime context when prior steps read untrusted email content", () => {
    const conversationMessages: ModelMessage[] = [
      {
        role: "user",
        content: "What does that latest email say?",
      },
    ];

    const context = updateAssistantMemoryRuntimeContext({
      experimentalContext:
        createAssistantMemoryRuntimeContext(conversationMessages),
      fallbackMessages: conversationMessages,
      steps: [
        {
          toolCalls: [{ toolName: "searchInbox" }, { toolName: "readEmail" }],
        },
      ],
    });

    expect(context.hasUntrustedRetrieval).toBe(true);
    expect(context.conversationMessages).toEqual(conversationMessages);
  });
});
