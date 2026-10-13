import { beforeEach, describe, expect, it, vi } from "vitest";
import { ICloudProvider } from "./icloud";
import { withICloudClient } from "@/utils/icloud/client";
const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma", () => ({
  default: {
    iCloudMessage: db,
  },
}));
vi.mock("@/utils/icloud/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/icloud/client")>()),
  withICloudClient: vi.fn(),
}));

const connection = {
  username: "owner@icloud.com",
  password: "test-app-password",
  folders: { inbox: "INBOX", archive: "Archive", trash: "Deleted Messages" },
};
let row: Record<string, unknown>;
let client: ReturnType<typeof fakeClient>;
beforeEach(() => {
  vi.clearAllMocks();
  row = {
    id: "owned",
    emailAccountId: "owner",
    folder: "INBOX",
    uidValidity: "1",
    uid: 5,
    moveDestination: null,
    moveUid: null,
    moveUidValidity: null,
  };
  client = fakeClient();
  db.findMany.mockResolvedValue([]);
  db.upsert.mockImplementation(async ({ create }) => ({
    ...create,
    id: `indexed-${create.folder}-${create.uid}`,
  }));
  db.findFirst.mockImplementation(async (args) =>
    args?.where?.id === "owned" && args.where.emailAccountId === "owner"
      ? ({ ...row } as never)
      : null,
  );
  db.updateMany.mockImplementation(async (args) => {
    if (args.where?.moveDestination === null && row.moveDestination !== null)
      return { count: 0 };
    Object.assign(row, args.data);
    return { count: 1 };
  });
  db.update.mockImplementation(async (args) => {
    Object.assign(row, args.data);
    return { ...row } as never;
  });
  vi.mocked(withICloudClient).mockImplementation(
    async (_credentials, callback) => callback(client as never),
  );
});

describe("iCloud message operations", () => {
  it("does not contact iCloud for a message owned by another account", async () => {
    const provider = new ICloudProvider("someone-else", connection);
    await expect(provider.getMessage("owned")).rejects.toThrow(
      "no longer available",
    );
    expect(withICloudClient).not.toHaveBeenCalled();
  });
  it("rejects stale UIDs after a folder UIDVALIDITY change", async () => {
    client.mailbox.uidValidity = BigInt(2);
    await expect(
      new ICloudProvider("owner", connection).markMessagesReadState(
        ["owned"],
        true,
      ),
    ).rejects.toThrow("folder changed");
    expect(client.messageFlagsAdd).not.toHaveBeenCalled();
  });
  it("keeps the message identity after a confirmed move and UID-scoped deletion", async () => {
    await new ICloudProvider("owner", connection).archiveMessages(["owned"]);
    expect(client.messageCopy).toHaveBeenCalledWith("5", "Archive", {
      uid: true,
    });
    expect(client.messageDelete).toHaveBeenCalledWith("5", { uid: true });
    expect(row).toMatchObject({
      id: "owned",
      folder: "Archive",
      uid: 20,
      uidValidity: "2",
      deletedAt: null,
      moveDestination: null,
    });
  });
  it("files received conversation messages without moving sent copies or drafts", async () => {
    const provider = new ICloudProvider("owner", connection);
    vi.spyOn(provider, "getThreadMessages").mockResolvedValue([
      { id: "owned", labelIds: ["INBOX"] },
      { id: "sent-copy", labelIds: ["SENT"] },
      { id: "draft-copy", labelIds: ["DRAFT"] },
    ] as Awaited<ReturnType<ICloudProvider["getThreadMessages"]>>);

    await expect(
      provider.moveThreadToFolder("thread", "", "Archive"),
    ).resolves.toBeUndefined();
    expect(client.messageCopy).toHaveBeenCalledTimes(1);
    expect(row.folder).toBe("Archive");
  });

  it("does not duplicate the copy after a confirmed copy and an interrupted source deletion", async () => {
    client.messageDelete.mockResolvedValueOnce(false);
    const provider = new ICloudProvider("owner", connection);
    await expect(provider.archiveMessages(["owned"])).rejects.toThrow(
      "remains in the source",
    );
    expect(row).toMatchObject({ moveDestination: "Archive", moveUid: 20 });
    await provider.archiveMessages(["owned"]);
    expect(client.messageCopy).toHaveBeenCalledTimes(1);
    expect(row.folder).toBe("Archive");
  });
  it("preserves the source if the confirmed destination copy is missing on retry", async () => {
    row.moveDestination = "Archive";
    row.moveUid = 20;
    row.moveUidValidity = "2";
    client.fetchOne.mockResolvedValue(false as never);
    await expect(
      new ICloudProvider("owner", connection).archiveMessages(["owned"]),
    ).rejects.toThrow("destination");
    expect(client.messageDelete).not.toHaveBeenCalled();
    expect(client.messageCopy).not.toHaveBeenCalled();
  });
  it("does not repeat a copy with an unknown outcome", async () => {
    client.messageCopy.mockRejectedValueOnce(new Error("Connection closed"));
    const provider = new ICloudProvider("owner", connection);
    await expect(provider.archiveMessages(["owned"])).rejects.toThrow();
    await expect(provider.archiveMessages(["owned"])).rejects.toThrow(
      "earlier folder move is unconfirmed",
    );
    expect(client.messageCopy).toHaveBeenCalledTimes(1);
    expect(client.messageDelete).not.toHaveBeenCalled();
  });
  it("continues reporting tombstones until every sync client can see them", async () => {
    db.findMany.mockResolvedValue([
      {
        id: "old",
        uid: 5,
        uidValidity: "1",
        deletedAt: new Date(),
        moveDestination: null,
      },
    ]);
    client.search.mockResolvedValue([]);
    const result = await new ICloudProvider(
      "owner",
      connection,
    ).getMailboxSyncPage({ limit: 20 });
    expect(result.deletedMessageIds).toContain("old");
  });
  it("reuses the reserved identity when a destination scan races a confirmed copy", async () => {
    db.findMany.mockResolvedValue([
      {
        ...row,
        threadId: "thread",
        moveDestination: "Archive",
        moveUid: 20,
        moveUidValidity: "2",
      },
    ]);
    client.search.mockResolvedValue([20]);
    client.fetchAll.mockResolvedValue([
      {
        uid: 20,
        flags: new Set(),
        internalDate: new Date(),
        headers: Buffer.from("Message-ID: <copy@example.test>\r\n\r\n"),
      },
    ]);
    const page = await new ICloudProvider(
      "owner",
      connection,
    ).getMessagesWithPagination({ folderId: "imap:QXJjaGl2ZQ" });
    expect(page.messages[0].id).toBe("owned");
    expect(db.upsert).not.toHaveBeenCalled();
  });
  it("does not delete indexed messages when IMAP SEARCH fails", async () => {
    client.search.mockResolvedValue(false);
    await expect(
      new ICloudProvider("owner", connection).getMailboxSyncPage({ limit: 20 }),
    ).rejects.toThrow("search");
    expect(db.updateMany).not.toHaveBeenCalled();
  });
  it("keeps metadata threading consistent with a full MIME fetch", async () => {
    const provider = new ICloudProvider("owner", connection);
    client.search.mockResolvedValue([10]);
    const metadata = {
      uid: 10,
      internalDate: new Date("2026-01-01"),
      flags: new Set(["\\Seen"]),
      envelope: { subject: "Reply", messageId: "<reply@example.test>" },
      headers: Buffer.from(
        "References: <root@example.test>\r\nMessage-ID: <reply@example.test>\r\n\r\n",
      ),
    };
    client.fetchAll.mockResolvedValue([metadata]);
    const page = await provider.getMessagesWithPagination({ maxResults: 10 });
    db.findFirst.mockResolvedValue({ ...row, uid: 10 });
    client.fetchOne.mockResolvedValue({
      ...metadata,
      source: Buffer.from(
        "References: <root@example.test>\r\nMessage-ID: <reply@example.test>\r\nContent-Type: text/plain\r\n\r\nHello",
      ),
    });
    const full = await provider.getMessage("owned");
    expect(page.messages[0].threadId).toBe(full.threadId);
    expect(full.textPlain?.trim()).toBe("Hello");
  });
  it("refuses moves that could expunge unrelated messages", async () => {
    client.capabilities.clear();
    await expect(
      new ICloudProvider("owner", connection).archiveMessages(["owned"]),
    ).rejects.toThrow();
    expect(client.messageCopy).not.toHaveBeenCalled();
    expect(client.messageDelete).not.toHaveBeenCalled();
  });
});
function fakeClient() {
  return {
    mailbox: { uidValidity: BigInt(1) },
    capabilities: new Map([["UIDPLUS", true]]),
    getMailboxLock: vi.fn().mockImplementation(async function (
      this: { mailbox: { uidValidity: bigint } },
      folder: string,
    ) {
      const previous = this.mailbox.uidValidity;
      this.mailbox.uidValidity = folder === "Archive" ? BigInt(2) : previous;
      return {
        release: () => {
          this.mailbox.uidValidity = previous;
        },
      };
    }),
    messageCopy: vi.fn().mockResolvedValue({
      uidValidity: BigInt(2),
      uidMap: new Map([[5, 20]]),
    }),
    messageDelete: vi.fn().mockResolvedValue(true),
    fetchOne: vi.fn().mockResolvedValue({ uid: 5 }),
    search: vi.fn().mockResolvedValue([] as number[] | false),
    fetchAll: vi.fn(),
    messageFlagsAdd: vi.fn(),
    messageFlagsRemove: vi.fn(),
  };
}
