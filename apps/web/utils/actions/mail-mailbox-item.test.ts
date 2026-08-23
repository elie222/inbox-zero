import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  deleteMailboxItemAction,
  renameMailboxItemAction,
  updateLabelColorAction,
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
  mockRenameLabel,
  mockUpdateLabelColor,
} = vi.hoisted(() => ({
  mockCreateEmailProvider: vi.fn(),
  mockDeleteFolder: vi.fn(),
  mockDeleteLabel: vi.fn(),
  mockRenameFolder: vi.fn(),
  mockRenameLabel: vi.fn(),
  mockUpdateLabelColor: vi.fn(),
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
      renameLabel: mockRenameLabel,
      updateLabelColor: mockUpdateLabelColor,
    });
  });

  it("renames a Gmail label through the provider", async () => {
    const result = await renameMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind: "label",
      id: "label-1",
      name: "Receipts",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockRenameLabel).toHaveBeenCalledWith("label-1", "Receipts");
  });

  it("renames an Outlook folder through the provider", async () => {
    setProvider("microsoft");

    const result = await renameMailboxItemAction(EMAIL_ACCOUNT_ID, {
      kind: "folder",
      id: "folder-1",
      name: "Projects",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockRenameFolder).toHaveBeenCalledWith("folder-1", "Projects");
  });

  it("updates an Outlook category color through the provider", async () => {
    setProvider("microsoft");

    const result = await updateLabelColorAction(EMAIL_ACCOUNT_ID, {
      labelId: "category-1",
      color: "preset5",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockUpdateLabelColor).toHaveBeenCalledWith("category-1", "preset5");
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
