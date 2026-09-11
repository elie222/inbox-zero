import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "owner@example.com" } })),
}));

describe("assistant chat server action boundary", () => {
  it("only exposes authenticated server actions from the action module", async () => {
    const actions = await import("@/utils/actions/assistant-chat");

    expect(actions).toHaveProperty("confirmAssistantEmailAction");
    expect(actions).toHaveProperty("confirmAssistantCreateRule");
    expect(actions).toHaveProperty("confirmAssistantSaveMemory");
    expect(actions).not.toHaveProperty("confirmAssistantEmailActionForAccount");
    expect(actions).not.toHaveProperty("confirmAssistantCreateRuleForAccount");
    expect(actions).not.toHaveProperty("confirmAssistantSaveMemoryForAccount");
  });
});
