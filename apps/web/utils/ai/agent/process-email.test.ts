import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentOnIncomingEmail } from "./process-email";
import type { ParsedMessage } from "@/utils/types";
import {
  buildAgentSystemPrompt,
  getAgentSystemData,
} from "@/utils/ai/agent/context";
import { createAgentTools } from "@/utils/ai/agent/agent";
import { createExecuteAction } from "@/utils/ai/agent/execution";
import { getModel } from "@/utils/llms/model";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { createScopedLogger } from "@/utils/logger";

vi.mock("ai", () => ({
  ToolLoopAgent: class {
    generate = vi.fn().mockResolvedValue(undefined);
  },
  stepCountIs: vi.fn(() => "stop"),
}));

vi.mock("@/utils/ai/agent/context", () => ({
  buildAgentSystemPrompt: vi.fn(),
  getAgentSystemData: vi.fn(),
}));
vi.mock("@/utils/ai/agent/agent", () => ({
  createAgentTools: vi.fn(),
}));
vi.mock("@/utils/ai/agent/execution", () => ({
  createExecuteAction: vi.fn(),
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(),
}));
vi.mock("@/utils/usage", () => ({
  saveAiUsage: vi.fn(),
}));
vi.mock("@/utils/stringify-email", () => ({
  stringifyEmail: vi.fn(),
}));
vi.mock("@/utils/get-email-from-message", () => ({
  getEmailForLLM: vi.fn(),
}));
vi.mock("@/utils/ai/agent/match-patterns", () => ({
  findMatchingPatterns: vi.fn().mockResolvedValue(null),
}));

const logger = createScopedLogger("test");
vi.spyOn(logger, "with").mockReturnValue(logger);

describe("runAgentOnIncomingEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "with").mockReturnValue(logger);
    vi.mocked(getAgentSystemData).mockResolvedValue({
      allowedActions: [],
      allowedActionOptions: [],
      skills: [],
      patterns: [],
    });
    vi.mocked(buildAgentSystemPrompt).mockResolvedValue("system");
    vi.mocked(getModel).mockReturnValue({
      model: {} as any,
      modelName: "chat-model",
      provider: "openai",
      providerOptions: {},
      backupModel: null,
    });
    vi.mocked(createExecuteAction).mockReturnValue(vi.fn() as any);
    vi.mocked(createAgentTools).mockReturnValue({} as any);
    vi.mocked(getEmailForLLM).mockReturnValue({} as any);
    vi.mocked(stringifyEmail).mockReturnValue("email prompt");
  });

  it("passes email context to processing_email tools", async () => {
    const message = {
      id: "msg-1",
      threadId: "thread-1",
    } as ParsedMessage;

    await runAgentOnIncomingEmail({
      emailAccount: {
        id: "ea-1",
        email: "user@example.com",
        user: {
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
        },
        account: { provider: "gmail" },
      } as any,
      message,
      logger,
    });

    expect(createAgentTools).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "processing_email",
        emailId: "msg-1",
        threadId: "thread-1",
      }),
    );
  });
});
