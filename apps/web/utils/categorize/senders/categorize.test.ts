import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import { defaultCategory } from "@/utils/categories";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { upsertSenderRecord } from "@/utils/senders/record";

vi.mock("@/utils/ai/categorize-sender/ai-categorize-single-sender", () => ({
  aiCategorizeSender: vi.fn(),
}));

vi.mock("@/utils/senders/record", () => ({
  upsertSenderRecord: vi.fn(),
}));

describe("categorizeSender", () => {
  const emailAccount = getEmailAccount();
  const categories = [
    {
      id: "cat-other",
      name: defaultCategory.OTHER.name,
      description: defaultCategory.OTHER.description,
    },
    {
      id: "cat-notification",
      name: defaultCategory.NOTIFICATION.name,
      description: defaultCategory.NOTIFICATION.description,
    },
  ];
  const provider = {
    getThreadsFromSenderWithSubject: vi.fn(),
  } as unknown as {
    getThreadsFromSenderWithSubject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider.getThreadsFromSenderWithSubject.mockResolvedValue([]);
  });

  it("defaults abstained single-sender categorization to Other", async () => {
    vi.mocked(aiCategorizeSender).mockResolvedValue(null);
    vi.mocked(upsertSenderRecord).mockResolvedValue({
      categoryId: "cat-other",
    } as Awaited<ReturnType<typeof upsertSenderRecord>>);

    const result = await categorizeSender(
      "unknown@example.com",
      emailAccount,
      provider as never,
      categories,
    );

    expect(upsertSenderRecord).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      newsletterEmail: "unknown@example.com",
      changes: {
        categoryId: "cat-other",
      },
    });
    expect(result).toEqual({ categoryId: "cat-other" });
  });
});
