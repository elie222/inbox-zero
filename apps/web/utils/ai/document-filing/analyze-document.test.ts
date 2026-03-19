import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { analyzeDocument } from "./analyze-document";

const { mockCreateGenerateObject, mockGenerateObject, mockGetModel } =
  vi.hoisted(() => {
    const mockGenerateObject = vi.fn();
    const mockCreateGenerateObject = vi.fn(() => mockGenerateObject);
    const mockGetModel = vi.fn();

    return {
      mockCreateGenerateObject,
      mockGenerateObject,
      mockGetModel,
    };
  });

vi.mock("@/utils/llms", () => ({
  createGenerateObject: mockCreateGenerateObject,
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: mockGetModel,
}));

describe("analyzeDocument", () => {
  const emailAccount = {
    id: "email-account-1",
    userId: "user-1",
    email: "user@example.com",
    about: null,
    multiRuleSelectionEnabled: false,
    timezone: "UTC",
    calendarBookingLink: null,
    filingPrompt: "Ignore small images that are part of the email.",
    user: {
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: null,
    },
    account: {
      provider: "google",
    },
  } as EmailAccountWithAI & { filingPrompt: string };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetModel.mockReturnValue({
      provider: "openai",
      modelName: "gpt-5.1-mini",
      model: {},
      providerOptions: undefined,
      fallbackModels: [],
    });

    mockGenerateObject.mockResolvedValue({
      object: {
        action: "skip",
        folderId: null,
        folderPath: null,
        confidence: 0.95,
        reasoning: "Skip inline image.",
      },
    });
  });

  it("includes attachment MIME type and size in the filing prompt", async () => {
    await analyzeDocument({
      emailAccount,
      email: {
        subject: "Receipt attached",
        sender: "billing@example.com",
      },
      attachment: {
        filename: "logo.png",
        mimeType: "image/png",
        size: 2048,
        content: "",
      },
      folders: [],
    });

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);

    const prompt = mockGenerateObject.mock.calls[0]?.[0]?.prompt;

    expect(prompt).toContain("<mime_type>image/png</mime_type>");
    expect(prompt).toContain("<size_bytes>2048</size_bytes>");
    expect(prompt).toContain(
      "Use the filename, MIME type, file size, email subject, and sender",
    );
  });
});
