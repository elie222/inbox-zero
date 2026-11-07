import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createTestLogger } from "@/__tests__/helpers";
import { SystemType } from "@/generated/prisma/enums";
import { resetDefaultLabelColors } from "@/utils/label/reset-label-colors";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

describe("resetDefaultLabelColors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets Inbox Zero labels, including renamed system labels, and leaves user labels alone", async () => {
    const emailProvider = createMockEmailProvider({ name: "google" });
    vi.mocked(emailProvider.getLabels).mockResolvedValue([
      {
        id: "renamed-to-reply",
        name: "Needs my reply",
        type: "user",
        color: { backgroundColor: "#e66550", textColor: "#000000" },
      },
      {
        id: "newsletter",
        name: "Newsletter",
        type: "user",
        color: { backgroundColor: "#ffc8af", textColor: "#000000" },
      },
      {
        id: "personal",
        name: "Personal",
        type: "user",
        color: { backgroundColor: "#e66550", textColor: "#000000" },
      },
    ]);
    prisma.rule.findMany.mockResolvedValue([
      {
        systemType: SystemType.TO_REPLY,
        actions: [{ labelId: "renamed-to-reply" }],
      },
    ] as any);

    const result = await resetDefaultLabelColors({
      emailAccountId: "account-id",
      emailProvider,
      provider: "google",
      logger,
    });

    expect(result).toEqual({ updated: 1, failed: 0 });
    expect(emailProvider.updateLabel).toHaveBeenCalledTimes(1);
    expect(emailProvider.updateLabel).toHaveBeenCalledWith("renamed-to-reply", {
      color: { backgroundColor: "#b3efd3", textColor: "#000000" },
    });
  });

  it("uses Outlook category presets for Outlook accounts", async () => {
    const emailProvider = createMockEmailProvider({ name: "microsoft" });
    vi.mocked(emailProvider.getLabels).mockResolvedValue([
      {
        id: "to-reply",
        name: "To Reply",
        type: "user",
        color: { backgroundColor: "#E74C3C", textColor: null },
      },
    ]);
    prisma.rule.findMany.mockResolvedValue([]);

    await resetDefaultLabelColors({
      emailAccountId: "account-id",
      emailProvider,
      provider: "microsoft",
      logger,
    });

    expect(emailProvider.updateLabel).toHaveBeenCalledWith("to-reply", {
      color: { backgroundColor: "#2ECC71", textColor: "#000000" },
    });
  });
});
