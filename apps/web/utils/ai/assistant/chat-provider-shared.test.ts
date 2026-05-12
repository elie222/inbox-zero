import { describe, expect, it, vi } from "vitest";
import { getAssistantChatProvider } from "./chat-provider-shared";

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const toolOptions = {
  email: "user@example.com",
  emailAccountId: "email-account-1",
  userId: "user-1",
  provider: "microsoft",
  logger: {} as any,
  setRuleReadState: vi.fn(),
  getRuleReadState: () => null,
};

describe("getAssistantChatProvider", () => {
  it("uses Outlook taxonomy and tools for Microsoft accounts", () => {
    const provider = getAssistantChatProvider("microsoft");

    expect(provider.threadActionPolicy).toBe(
      "archive, trash, categorize, mark read",
    );
    expect(provider.hiddenTaxonomyIdName).toBe("categoryId");
    expect(provider.missingContextPolicy).toBe(
      "If categories and folders are missing",
    );
    expect(provider.searchSyntaxPolicy).toContain("Outlook search syntax");
    expect(provider.searchSyntaxPolicy).toContain(
      "Do not use Gmail-specific operators",
    );
    expect(Object.keys(provider.getTaxonomyTools(toolOptions))).toEqual([
      "listCategories",
      "createOrGetCategory",
    ]);
  });

  it("falls back to Gmail taxonomy and tools for unknown providers", () => {
    const provider = getAssistantChatProvider("unknown");

    expect(provider.threadActionPolicy).toBe(
      "archive, trash, label, mark read",
    );
    expect(provider.hiddenTaxonomyIdName).toBe("labelId");
    expect(provider.searchSyntaxPolicy).toContain("Gmail search syntax");
    expect(Object.keys(provider.getTaxonomyTools(toolOptions))).toEqual([
      "listLabels",
      "createOrGetLabel",
    ]);
  });
});
