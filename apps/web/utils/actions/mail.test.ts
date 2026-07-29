import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createEmailProviderMock } = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));

import {
  deleteLabelAction,
  sendEmailAction,
  updateLabelAction,
  updateLabelsAction,
} from "@/utils/actions/mail";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: {
      userId: "user-1",
      provider: "google",
    },
  } as any);
});

describe("updateLabelsAction", () => {
  it("upserts enabled labels and only deletes the names marked disabled", async () => {
    await updateLabelsAction("account-1", {
      labels: [
        {
          name: "Billing",
          description: "Invoices",
          enabled: true,
          gmailLabelId: "Label_1",
        },
        {
          name: "Old",
          enabled: false,
          gmailLabelId: "Label_2",
        },
      ],
    });

    expect(prisma.label.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.label.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name_emailAccountId: {
            name: "Billing",
            emailAccountId: "account-1",
          },
        },
      }),
    );

    // The delete must be scoped to the explicitly-disabled names — never a
    // blanket delete of rows missing from the payload.
    expect(prisma.label.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        name: { in: ["Old"] },
      },
    });
  });

  it("does not delete anything when all labels are enabled", async () => {
    await updateLabelsAction("account-1", {
      labels: [
        {
          name: "Billing",
          enabled: true,
          gmailLabelId: "Label_1",
        },
      ],
    });

    expect(prisma.label.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        name: { in: [] },
      },
    });
  });
});

describe("updateLabelAction", () => {
  it("keeps the row (with description) when disabling a folder", async () => {
    await updateLabelAction("account-1", {
      name: "Billing",
      description: "Invoices",
      enabled: false,
      gmailLabelId: "Label_1",
    });

    expect(prisma.label.upsert).toHaveBeenCalledWith({
      where: {
        name_emailAccountId: {
          name: "Billing",
          emailAccountId: "account-1",
        },
      },
      create: {
        gmailLabelId: "Label_1",
        name: "Billing",
        description: "Invoices",
        enabled: false,
        emailAccountId: "account-1",
        icon: undefined,
      },
      update: {
        name: "Billing",
        description: "Invoices",
        enabled: false,
        gmailLabelId: "Label_1",
        icon: undefined,
      },
    });
    expect(prisma.label.deleteMany).not.toHaveBeenCalled();
  });

  it("persists a chosen icon", async () => {
    await updateLabelAction("account-1", {
      name: "Billing",
      enabled: true,
      gmailLabelId: "Label_1",
      icon: "receipt",
    });

    expect(prisma.label.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ icon: "receipt" }),
        update: expect.objectContaining({ icon: "receipt" }),
      }),
    );
  });

  it("leaves the stored icon untouched when the save omits it", async () => {
    await updateLabelAction("account-1", {
      name: "Billing",
      description: "Invoices",
      enabled: true,
      gmailLabelId: "Label_1",
    });

    // undefined means "don't change" in prisma updates — the AI settings
    // save must not clear an icon picked earlier
    expect(prisma.label.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ icon: undefined }),
      }),
    );
  });

  it("persists a chosen colour", async () => {
    await updateLabelAction("account-1", {
      name: "Billing",
      enabled: true,
      gmailLabelId: "Label_1",
      color: "hsl(210 65% 55%)",
    });

    expect(prisma.label.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ color: "hsl(210 65% 55%)" }),
        update: expect.objectContaining({ color: "hsl(210 65% 55%)" }),
      }),
    );
  });
});

describe("deleteLabelAction", () => {
  const deleteLabel = vi.fn();

  beforeEach(() => {
    createEmailProviderMock.mockResolvedValue({ deleteLabel });
    prisma.rule.findMany.mockResolvedValue([]);
    prisma.action.findMany.mockResolvedValue([]);
  });

  it("deletes the folder at the provider and locally", async () => {
    await deleteLabelAction("account-1", {
      labelId: "Label_1",
      name: "Billing",
    });

    expect(deleteLabel).toHaveBeenCalledWith("Label_1");
    expect(prisma.label.deleteMany).toHaveBeenCalledWith({
      where: { emailAccountId: "account-1", gmailLabelId: "Label_1" },
    });
  });

  it("deletes a rule that only existed to file into this folder", async () => {
    prisma.rule.findMany.mockResolvedValue([
      { id: "rule-1", actions: [{ id: "act-1", type: "LABEL" }] },
    ] as never);
    prisma.action.findMany.mockResolvedValue([
      { id: "act-1", ruleId: "rule-1" },
    ] as never);

    await deleteLabelAction("account-1", {
      labelId: "Label_1",
      name: "Billing",
    });

    expect(prisma.rule.delete).toHaveBeenCalledWith({
      where: { id: "rule-1" },
    });
    expect(prisma.action.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps a rule that also does other things, dropping only its filing action", async () => {
    prisma.rule.findMany.mockResolvedValue([
      {
        id: "rule-1",
        actions: [
          { id: "act-1", type: "LABEL" },
          { id: "act-2", type: "DRAFT_EMAIL" },
        ],
      },
    ] as never);
    prisma.action.findMany.mockResolvedValue([
      { id: "act-1", ruleId: "rule-1" },
    ] as never);

    await deleteLabelAction("account-1", {
      labelId: "Label_1",
      name: "Billing",
    });

    expect(prisma.rule.delete).not.toHaveBeenCalled();
    expect(prisma.action.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule-1", id: { in: ["act-1"] } },
    });
  });

  it("does not touch the local rows when the provider delete fails", async () => {
    deleteLabel.mockRejectedValueOnce(new Error("provider down"));

    const result = await deleteLabelAction("account-1", {
      labelId: "Label_1",
      name: "Billing",
    });

    expect(result?.serverError).toBeDefined();
    expect(prisma.label.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rule.delete).not.toHaveBeenCalled();
  });
});

describe("sendEmailAction", () => {
  it("rejects attachments over the 10MB total cap before touching the provider", async () => {
    const sendEmailWithHtml = vi.fn();
    createEmailProviderMock.mockResolvedValue({ sendEmailWithHtml });

    // ~11MB decoded (base64 length * 0.75)
    const oversized = "a".repeat(Math.ceil((11 * 1024 * 1024 * 4) / 3));

    const result = await sendEmailAction("account-1", {
      to: "recipient@example.com",
      subject: "Subject",
      messageHtml: "<p>hi</p>",
      attachments: [
        {
          filename: "big.bin",
          contentType: "application/octet-stream",
          content: oversized,
        },
      ],
    });

    expect(result?.serverError).toBeTruthy();
    expect(sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("passes attachments within the cap through to the provider", async () => {
    const sendEmailWithHtml = vi
      .fn()
      .mockResolvedValue({ messageId: "m1", threadId: "t1" });
    createEmailProviderMock.mockResolvedValue({ sendEmailWithHtml });

    const result = await sendEmailAction("account-1", {
      to: "recipient@example.com",
      subject: "Subject",
      messageHtml: "<p>hi</p>",
      attachments: [
        {
          filename: "notes.txt",
          contentType: "text/plain",
          content: Buffer.from("hello").toString("base64"),
        },
      ],
    });

    expect(result?.data).toEqual({
      success: true,
      messageId: "m1",
      threadId: "t1",
    });
    expect(sendEmailWithHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "notes.txt",
            contentType: "text/plain",
          }),
        ],
      }),
    );
  });
});
