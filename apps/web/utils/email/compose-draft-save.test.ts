import { beforeEach, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { ComposeDraftSave, Prisma } from "@/generated/prisma/client";
import { saveComposeDraftWithReceipt } from "./compose-draft-save";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const content = {
  to: "recipient@example.com",
  subject: "Reply",
  messageHtml: "<p>Hello</p>",
};
const input = { emailAccountId: "account", requestId: "compose-1", content };
let row: ComposeDraftSave;
const provider = {
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getDrafts: vi.fn(),
  getThread: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
} as unknown as EmailProvider;

beforeEach(() => {
  vi.clearAllMocks();
  row = {
    id: "receipt",
    emailAccountId: "account",
    requestId: "compose-1",
    createdAt: new Date(0),
    status: "READY",
    draftId: null,
    legacyUnconfirmed: false,
    creationInput: content,
    updatedAt: new Date(0),
  };
  let inserted = false;
  vi.mocked(prisma.composeDraftSave.upsert).mockImplementation((async ({
    create,
  }: Prisma.ComposeDraftSaveUpsertArgs) => {
    if (!inserted) Object.assign(row, create);
    inserted = true;
    return row;
  }) as never);
  vi.mocked(prisma.composeDraftSave.findUnique).mockResolvedValue(row);
  vi.mocked(prisma.composeDraftSave.updateMany).mockImplementation((async ({
    where,
    data,
  }: Prisma.ComposeDraftSaveUpdateManyArgs) => {
    if (typeof where?.status === "string" && where.status !== row.status)
      return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  }) as never);
  vi.mocked(prisma.composeDraftSave.update).mockImplementation((async ({
    data,
  }: Prisma.ComposeDraftSaveUpdateArgs) => Object.assign(row, data)) as never);
  vi.mocked(provider.createDraft).mockImplementation(async (params) => {
    await params.onCreated?.("draft-1");
    return { id: "draft-1" };
  });
  vi.mocked(provider.getDraft).mockResolvedValue({
    id: "message-1",
    threadId: "thread-1",
  } as never);
  vi.mocked(provider.updateDraft).mockResolvedValue(undefined);
  vi.mocked(provider.getDrafts).mockResolvedValue([]);
  vi.mocked(provider.getThread).mockResolvedValue({ messages: [] } as never);
});

it("recovers a lost client response without creating another mailbox draft", async () => {
  expect(
    await saveComposeDraftWithReceipt({ ...input, provider }),
  ).toMatchObject({ draftId: "draft-1" });
  expect(
    await saveComposeDraftWithReceipt({
      ...input,
      provider,
      content: { ...content, messageHtml: "<p>Edited</p>" },
    }),
  ).toMatchObject({ draftId: "draft-1" });
  expect(provider.createDraft).toHaveBeenCalledOnce();
  expect(provider.updateDraft).toHaveBeenLastCalledWith(
    "draft-1",
    expect.objectContaining({ messageHtml: "<p>Edited</p>" }),
  );
});

it("retains an Outlook draft id when updating the newly created reply fails", async () => {
  vi.mocked(provider.createDraft).mockImplementationOnce(async (params) => {
    await params.onCreated?.("outlook-draft");
    throw new Error("patch failed");
  });
  expect(
    await saveComposeDraftWithReceipt({ ...input, provider }),
  ).toMatchObject({ draftId: "outlook-draft" });
  expect(row.draftId).toBe("outlook-draft");
});

it("allows retry after a definitive provider rejection", async () => {
  vi.mocked(provider.createDraft).mockRejectedValueOnce(
    Object.assign(new Error("Invalid recipient"), { status: 400 }),
  );
  await expect(
    saveComposeDraftWithReceipt({ ...input, provider }),
  ).rejects.toThrow("Invalid recipient");
  expect(row.status).toBe("READY");
  await expect(
    saveComposeDraftWithReceipt({
      ...input,
      provider,
      creationUnconfirmed: true,
    }),
  ).resolves.toMatchObject({ draftId: "draft-1" });
});

it("does not repeat an ambiguous provider write when no matching draft can be found", async () => {
  vi.mocked(provider.createDraft).mockRejectedValueOnce(
    new Error("response lost"),
  );
  await expect(
    saveComposeDraftWithReceipt({ ...input, provider }),
  ).rejects.toThrow("response lost");
  await expect(
    saveComposeDraftWithReceipt({ ...input, provider }),
  ).rejects.toThrow(/could not be confirmed/);
  expect(provider.createDraft).toHaveBeenCalledOnce();
});

it("recovers a legacy browser flag after confirming its thread contains no mailbox draft", async () => {
  await expect(
    saveComposeDraftWithReceipt({
      ...input,
      provider,
      creationUnconfirmed: true,
      content: { ...content, replyToEmail: { threadId: "thread-1" } },
    }),
  ).resolves.toMatchObject({ draftId: "draft-1" });
  expect(provider.getThread).toHaveBeenCalledWith("thread-1", {
    complete: true,
    includeDrafts: true,
  });
});

it("does not create a duplicate while another save owns the creation", async () => {
  row.status = "CREATING";
  row.updatedAt = new Date();
  await expect(
    saveComposeDraftWithReceipt({ ...input, provider }),
  ).rejects.toThrow(/still being confirmed/);
  expect(provider.createDraft).not.toHaveBeenCalled();
});

it("never recreates a sent or discarded draft from an older browser session", async () => {
  row.status = "SENT";
  row.draftId = "draft-1";
  await expect(
    saveComposeDraftWithReceipt({ ...input, provider }),
  ).rejects.toThrow(/already sent or discarded/);
  expect(provider.createDraft).not.toHaveBeenCalled();
});
