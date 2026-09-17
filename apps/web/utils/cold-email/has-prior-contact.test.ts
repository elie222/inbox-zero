import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasPriorContactOrAssumeYes } from "./has-prior-contact";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

describe("hasPriorContactOrAssumeYes", () => {
  const provider = {
    hasPreviousCommunicationsWithSenderOrDomain: vi.fn(),
    getLabelByName: vi.fn(),
  };

  const check = (overrides: Record<string, unknown> = {}) =>
    hasPriorContactOrAssumeYes({
      provider: provider as never,
      from: "sender@example.com",
      date: new Date(),
      messageId: "msg-1",
      logger,
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects all label and folder actions independently of action order", async () => {
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      false,
    );
    await expect(
      check({
        coldEmailActions: [
          { type: "ARCHIVE" },
          { type: "LABEL", labelId: "cold-1" },
          { type: "MOVE_FOLDER", folderId: "folder-1" },
          { type: "LABEL", labelId: "cold-2" },
        ],
      }),
    ).resolves.toBe(false);
    expect(
      provider.hasPreviousCommunicationsWithSenderOrDomain,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeLabelIds: ["cold-1", "cold-2"],
        excludeFolderIds: ["folder-1"],
      }),
    );
  });

  it("resolves a name-only label without embedding it in a search query", async () => {
    provider.getLabelByName.mockResolvedValue({ id: "resolved" });
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      false,
    );
    await check({
      coldEmailActions: [{ type: "LABEL", label: 'Cold "mail"' }],
    });
    expect(
      provider.hasPreviousCommunicationsWithSenderOrDomain,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ excludeLabelIds: ["resolved"] }),
    );
  });

  it.each([
    false,
    true,
  ])("preserves prior contact=%s when a cold label has not been created yet", async (hasPriorContact) => {
    provider.getLabelByName.mockResolvedValue(null);
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      hasPriorContact,
    );

    await expect(
      check({ coldEmailActions: [{ type: "LABEL", label: "Cold Email" }] }),
    ).resolves.toBe(hasPriorContact);
    expect(
      provider.hasPreviousCommunicationsWithSenderOrDomain,
    ).toHaveBeenCalledWith({
      from: "sender@example.com",
      date: expect.any(Date),
      messageId: "msg-1",
    });
  });

  it("retains the old check before a folder action has resolved its ID", async () => {
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      false,
    );
    await expect(
      check({
        coldEmailActions: [{ type: "MOVE_FOLDER", folderName: "Cold Email" }],
      }),
    ).resolves.toBe(false);
    expect(
      provider.hasPreviousCommunicationsWithSenderOrDomain.mock.calls.at(
        -1,
      )?.[0],
    ).not.toHaveProperty("excludeFolderIds");
  });

  it("assumes contact when resolving an exclusion fails", async () => {
    provider.getLabelByName.mockRejectedValue(
      new Error("provider unavailable"),
    );
    await expect(
      check({ coldEmailActions: [{ type: "LABEL", label: "Cold Email" }] }),
    ).resolves.toBe(true);
    expect(
      provider.hasPreviousCommunicationsWithSenderOrDomain,
    ).not.toHaveBeenCalled();
  });

  it("reports what the provider found", async () => {
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      false,
    );

    await expect(check()).resolves.toBe(false);
  });

  // Each of these would otherwise read as "no prior contact", which is the input that
  // pushes the cold email blocker toward blocking a sender we could not verify.
  it.each([
    [
      "the provider errors",
      {},
      () =>
        provider.hasPreviousCommunicationsWithSenderOrDomain.mockRejectedValue(
          new Error("api down"),
        ),
    ],
    ["the sender is blank", { from: " " }, () => {}],
    ["the date is missing", { date: undefined }, () => {}],
    ["the date is invalid", { date: new Date(Number.NaN) }, () => {}],
    ["the message id is missing", { messageId: undefined }, () => {}],
  ])("assumes contact when %s", async (_name, overrides, arrange) => {
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      false,
    );
    arrange();

    await expect(check(overrides)).resolves.toBe(true);
  });

  it.each([
    { from: " " },
    { date: undefined },
    { messageId: undefined },
  ])("does not call the provider when contact cannot be identified", async (overrides) => {
    await check(overrides);

    expect(
      provider.hasPreviousCommunicationsWithSenderOrDomain,
    ).not.toHaveBeenCalled();
  });
});
