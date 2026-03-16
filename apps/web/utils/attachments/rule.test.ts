import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import { handleRuleAttachmentSourceSave } from "./rule";
import { toastError, toastSuccess } from "@/components/Toast";
import { upsertRuleAttachmentSourcesAction } from "@/utils/actions/attachment-sources";

vi.mock("@/components/Toast", () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/utils/actions/attachment-sources", () => ({
  upsertRuleAttachmentSourcesAction: vi.fn(),
}));

describe("handleRuleAttachmentSourceSave", () => {
  const attachmentSources = [
    {
      driveConnectionId: "drive-1",
      name: "lease.pdf",
      sourceId: "file-1",
      sourcePath: "/Docs",
      type: AttachmentSourceType.FILE,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips persistence when draft actions are disabled", async () => {
    const result = await handleRuleAttachmentSourceSave({
      emailAccountId: "account-1",
      ruleId: "rule-1",
      attachmentSources,
      shouldSave: false,
      successMessage: "Saved!",
      partialErrorMessage: "Partial",
    });

    expect(result).toBe("skipped");
    expect(upsertRuleAttachmentSourcesAction).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith({ description: "Saved!" });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows an error toast when attachment source persistence is partial", async () => {
    vi.mocked(upsertRuleAttachmentSourcesAction).mockResolvedValue({
      serverError: "Detailed failure",
    } as any);

    const result = await handleRuleAttachmentSourceSave({
      emailAccountId: "account-1",
      ruleId: "rule-1",
      attachmentSources,
      shouldSave: true,
      successMessage: "Saved!",
      partialErrorMessage: "Partial",
    });

    expect(result).toBe("partial");
    expect(upsertRuleAttachmentSourcesAction).toHaveBeenCalledWith(
      "account-1",
      {
        ruleId: "rule-1",
        sources: attachmentSources,
      },
    );
    expect(toastError).toHaveBeenCalledWith({
      description: "Detailed failure",
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows a success toast when attachment sources are persisted", async () => {
    vi.mocked(upsertRuleAttachmentSourcesAction).mockResolvedValue({
      data: { count: 1 },
    } as any);

    const result = await handleRuleAttachmentSourceSave({
      emailAccountId: "account-1",
      ruleId: "rule-1",
      attachmentSources,
      shouldSave: true,
      successMessage: "Created!",
      partialErrorMessage: "Partial",
    });

    expect(result).toBe("ok");
    expect(toastSuccess).toHaveBeenCalledWith({ description: "Created!" });
    expect(toastError).not.toHaveBeenCalled();
  });
});
