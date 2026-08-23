import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import { MailSplitKind } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  deleteMailboxItemAction,
  updateMailboxItemAction,
} from "@/utils/actions/mail";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const {
  mockCreateEmailProvider,
  mockDeleteFolder,
  mockDeleteLabel,
  mockRenameFolder,
  mockUpdateLabel,
} = vi.hoisted(() => ({
  mockCreateEmailProvider: vi.fn(),
  mockDeleteFolder: vi.fn(),
  mockDeleteLabel: vi.fn(),
  mockRenameFolder: vi.fn(),
  mockUpdateLabel: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: Parameters<typeof mockCreateEmailProvider>) =>
    mockCreateEmailProvider(...args),
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

describe("mailbox item actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "user@example.com",
        userId: "user-1",
        provider: "google",
      }),
    );
    mockCreateEmailProvider.mockResolvedValue({
      deleteFolder: mockDeleteFolder,
      deleteLabel: mockDeleteLabel,
      renameFolder: mockRenameFolder,
      updateLabel: mockUpdateLabel,
    });
  });

  it("renames a Gmail label through the provider", async () => {
    const result = await updateMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind: "label",
      id: "label-1",
      name: "Receipts",
      color: {
        backgroundColor: "#e66550",
        textColor: "#000000",
      },
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockUpdateLabel).toHaveBeenCalledWith("label-1", {
      name: "Receipts",
      color: {
        backgroundColor: "#e66550",
        textColor: "#000000",
      },
    });
  });

  it("renames an Outlook folder through the provider", async () => {
    setProvider("microsoft");

    const result = await updateMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind: "folder",
      id: "folder-1",
      name: "Projects",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockRenameFolder).toHaveBeenCalledWith("folder-1", "Projects");
  });

  it("updates an Outlook category color through the provider", async () => {
    setProvider("microsoft");

    const result = await updateMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind: "label",
      id: "category-1",
      color: {
        backgroundColor: "#1ABC9C",
        textColor: "#000000",
      },
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockUpdateLabel).toHaveBeenCalledWith("category-1", {
      color: {
        backgroundColor: "#1ABC9C",
        textColor: "#000000",
      },
    });
  });

  it.each([
    ["google" as const, "#123456", "Select a supported Gmail label color."],
    [
      "microsoft" as const,
      "#654321",
      "Select a supported Outlook category color.",
    ],
  ])("rejects unsupported %s label colors before calling the provider", async (provider, backgroundColor, expectedError) => {
    setProvider(provider);

    const result = await updateMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind: "label",
      id: "label-1",
      color: { backgroundColor, textColor: "#000000" },
    });

    expect(result?.serverError).toBe(expectedError);
    expect(mockUpdateLabel).not.toHaveBeenCalled();
  });

  it.each([
    ["label" as const, mockDeleteLabel],
    ["folder" as const, mockDeleteFolder],
  ])("deletes a user-created %s through the provider", async (kind, method) => {
    if (kind === "folder") setProvider("microsoft");

    const result = await deleteMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind,
      id: `${kind}-1`,
    });

    expect(result?.serverError).toBeUndefined();
    expect(method).toHaveBeenCalledWith(`${kind}-1`);
    if (kind === "label") {
      expect(prisma.mailSplit.deleteMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: EMAIL_ACCOUNT_ID,
          kind: MailSplitKind.LABEL,
          value: "label-1",
        },
      });
    } else {
      expect(prisma.mailSplit.deleteMany).not.toHaveBeenCalled();
    }
  });

  it("rejects folder mutations for non-Outlook accounts", async () => {
    const result = await deleteMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind: "folder",
      id: "folder-1",
    });

    expect(result?.serverError).toBe(
      "Folder actions are only available for Outlook accounts.",
    );
    expect(mockDeleteFolder).not.toHaveBeenCalled();
  });
});

function setProvider(provider: "google" | "microsoft") {
  prisma.emailAccount.findUnique.mockResolvedValue(
    getMockEmailAccountWithAccount({
      email: "user@example.com",
      userId: "user-1",
      provider,
    }),
  );
}
