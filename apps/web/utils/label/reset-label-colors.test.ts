import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createTestLogger } from "@/__tests__/helpers";
import { SystemType } from "@/generated/prisma/enums";
import { getGmailDefaultLabelColor } from "@/utils/label";
import { resetDefaultLabelColors } from "@/utils/label/reset-label-colors";

vi.mock("@/utils/prisma");

const logger = createTestLogger();
const red = { backgroundColor: "#e66550", textColor: "#000000" };

describe("resetDefaultLabelColors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets built-in labels, including renamed ones, and leaves user labels alone", async () => {
    const emailProvider = createMockEmailProvider();
    vi.mocked(emailProvider.getLabels).mockResolvedValue([
      {
        id: "renamed-to-reply",
        name: "Needs my reply",
        type: "user",
        color: red,
      },
      {
        id: "newsletter",
        name: "Newsletter",
        type: "user",
        color: getGmailDefaultLabelColor("coral"),
      },
      { id: "personal", name: "Personal", type: "user", color: red },
    ]);
    prisma.rule.findMany.mockResolvedValue([
      {
        systemType: SystemType.TO_REPLY,
        actions: [{ labelId: "renamed-to-reply", label: "Needs my reply" }],
      },
    ] as any);

    const result = await resetDefaultLabelColors({
      emailAccountId: "account-id",
      emailProvider,
      logger,
    });

    expect(result).toEqual({ updated: 1, failed: 0 });
    expect(emailProvider.updateLabel).toHaveBeenCalledTimes(1);
    expect(emailProvider.updateLabel).toHaveBeenCalledWith("renamed-to-reply", {
      color: getGmailDefaultLabelColor("green"),
    });
  });

  it("does not recolor extra labels a user added to a system rule", async () => {
    const emailProvider = createMockEmailProvider();
    vi.mocked(emailProvider.getLabels).mockResolvedValue([
      { id: "to-reply", name: "To Reply", type: "user", color: red },
      { id: "personal", name: "Personal", type: "user", color: red },
    ]);
    prisma.rule.findMany.mockResolvedValue([
      {
        systemType: SystemType.TO_REPLY,
        actions: [
          { labelId: "to-reply", label: "To Reply" },
          { labelId: "personal", label: "Personal" },
        ],
      },
    ] as any);

    await resetDefaultLabelColors({
      emailAccountId: "account-id",
      emailProvider,
      logger,
    });

    expect(emailProvider.updateLabel).toHaveBeenCalledTimes(1);
    expect(emailProvider.updateLabel).toHaveBeenCalledWith("to-reply", {
      color: getGmailDefaultLabelColor("green"),
    });
  });

  it("does not treat an extra label as built-in when the built-in label has no id", async () => {
    const emailProvider = createMockEmailProvider();
    vi.mocked(emailProvider.getLabels).mockResolvedValue([
      { id: "personal", name: "Personal", type: "user", color: red },
    ]);
    prisma.rule.findMany.mockResolvedValue([
      {
        systemType: SystemType.TO_REPLY,
        actions: [
          { labelId: null, label: "To Reply" },
          { labelId: "personal", label: "Personal" },
        ],
      },
    ] as any);

    const result = await resetDefaultLabelColors({
      emailAccountId: "account-id",
      emailProvider,
      logger,
    });

    expect(result).toEqual({ updated: 0, failed: 0 });
    expect(emailProvider.updateLabel).not.toHaveBeenCalled();
  });

  it("repairs a label whose background matches but text color does not", async () => {
    const emailProvider = createMockEmailProvider();
    vi.mocked(emailProvider.getLabels).mockResolvedValue([
      {
        id: "to-reply",
        name: "To Reply",
        type: "user",
        color: { ...getGmailDefaultLabelColor("green"), textColor: "#ffffff" },
      },
    ]);
    prisma.rule.findMany.mockResolvedValue([]);

    const result = await resetDefaultLabelColors({
      emailAccountId: "account-id",
      emailProvider,
      logger,
    });

    expect(result).toEqual({ updated: 1, failed: 0 });
  });

  it("counts failed updates without stopping the rest", async () => {
    const emailProvider = createMockEmailProvider();
    vi.mocked(emailProvider.getLabels).mockResolvedValue([
      { id: "to-reply", name: "To Reply", type: "user", color: red },
      { id: "fyi", name: "FYI", type: "user", color: red },
    ]);
    vi.mocked(emailProvider.updateLabel)
      .mockRejectedValueOnce(new Error("provider error"))
      .mockResolvedValueOnce(undefined);
    prisma.rule.findMany.mockResolvedValue([]);

    const result = await resetDefaultLabelColors({
      emailAccountId: "account-id",
      emailProvider,
      logger,
    });

    expect(result).toEqual({ updated: 1, failed: 1 });
  });
});
