import { vi, describe, it, expect, beforeEach } from "vitest";
import { cleanupLabel } from "./run-label-cleanup";
import { LabelCleanupAction } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

// The runner's account loop is not exercised here; keep the provider factory
// (and its mail parsers) out of the import graph.
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/prisma", () => ({ default: {} }));

describe("cleanupLabel", () => {
  const listMessageIds = vi.fn();
  const removeThreadLabel = vi.fn().mockResolvedValue(undefined);
  const trashThread = vi.fn().mockResolvedValue(undefined);
  const provider = {
    listMessageIds,
    removeThreadLabel,
    trashThread,
  } as unknown as EmailProvider;

  const baseArgs = {
    provider,
    ownerEmail: "user@example.com",
    labelId: "Label_1",
    afterDays: 30,
    logger,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listMessageIds.mockResolvedValue({
      messages: [
        { id: "m1", threadId: "t1" },
        { id: "m2", threadId: "t1" },
        { id: "m3", threadId: "t2" },
      ],
    });
  });

  it("removes the label from each old thread once", async () => {
    const processed = await cleanupLabel({
      ...baseArgs,
      action: LabelCleanupAction.REMOVE_LABEL,
    });

    expect(listMessageIds).toHaveBeenCalledWith(
      expect.objectContaining({
        labelIds: ["Label_1"],
        query: "older_than:30d",
      }),
    );
    expect(removeThreadLabel).toHaveBeenCalledTimes(2);
    expect(removeThreadLabel).toHaveBeenCalledWith("t1", "Label_1");
    expect(removeThreadLabel).toHaveBeenCalledWith("t2", "Label_1");
    expect(trashThread).not.toHaveBeenCalled();
    expect(processed).toBe(2);
  });

  it("trashes threads when the action is trash", async () => {
    await cleanupLabel({ ...baseArgs, action: LabelCleanupAction.TRASH });

    expect(trashThread).toHaveBeenCalledTimes(2);
    expect(trashThread).toHaveBeenCalledWith(
      "t1",
      "user@example.com",
      "automation",
    );
    expect(removeThreadLabel).not.toHaveBeenCalled();
  });

  it("follows pagination", async () => {
    listMessageIds
      .mockResolvedValueOnce({
        messages: [{ id: "m1", threadId: "t1" }],
        nextPageToken: "next",
      })
      .mockResolvedValueOnce({ messages: [{ id: "m2", threadId: "t2" }] });

    const processed = await cleanupLabel({
      ...baseArgs,
      action: LabelCleanupAction.REMOVE_LABEL,
    });

    expect(listMessageIds).toHaveBeenCalledTimes(2);
    expect(listMessageIds).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageToken: "next" }),
    );
    expect(processed).toBe(2);
  });

  it("keeps going when one thread fails", async () => {
    removeThreadLabel.mockRejectedValueOnce(new Error("gone"));

    const processed = await cleanupLabel({
      ...baseArgs,
      action: LabelCleanupAction.REMOVE_LABEL,
    });

    expect(processed).toBe(1);
  });

  it("skips providers that cannot list by label", async () => {
    const processed = await cleanupLabel({
      ...baseArgs,
      provider: { removeThreadLabel, trashThread } as unknown as EmailProvider,
      action: LabelCleanupAction.REMOVE_LABEL,
    });

    expect(processed).toBe(0);
    expect(removeThreadLabel).not.toHaveBeenCalled();
  });
});
