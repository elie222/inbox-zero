import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectICloud, getICloudConnection } from "./connection";
import { decryptToken } from "@/utils/encryption";
import { withICloudClient } from "@/utils/icloud/client";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: {
    EMAIL_ENCRYPT_SECRET: "test-only-secret",
    EMAIL_ENCRYPT_SALT: "test-only-salt",
  },
}));
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: { findUnique: db.findUnique },
    account: { create: db.create, updateMany: db.updateMany },
    iCloudConnection: { update: db.update, findUnique: db.connection },
  },
}));
vi.mock("@/utils/icloud/client", () => ({ withICloudClient: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  db.findUnique.mockResolvedValue(null);
  db.create.mockResolvedValue({ emailAccount: { id: "new-account" } });
  vi.mocked(withICloudClient).mockImplementation(
    async (_credentials, operation) =>
      operation({
        list: async () => [
          { path: "INBOX", flags: new Set(), specialUse: "\\Inbox" },
        ],
      } as never),
  );
});

describe("iCloud account connection", () => {
  it.each([
    { userId: "another-user", account: { provider: "icloud" } },
    { userId: "owner", account: { provider: "google" } },
  ])("rejects an address already attached to a different owner or provider", async (existing) => {
    db.findUnique.mockResolvedValue({ id: "existing", ...existing });
    await expect(
      connectICloud({
        userId: "owner",
        email: "owner@icloud.com",
        password: "test-app-password",
      }),
    ).rejects.toThrow("already connected");
    expect(withICloudClient).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("stores only encrypted credentials after verifying the mailbox", async () => {
    await expect(
      connectICloud({
        userId: "owner",
        email: " Owner@iCloud.com ",
        password: "test-app-password",
      }),
    ).resolves.toEqual({ emailAccountId: "new-account" });
    const saved = db.create.mock.calls[0][0].data;
    const connection = saved.emailAccount.create.iCloudConnection.create;
    expect(saved.provider).toBe("icloud");
    expect(connection.username).toBe("owner@icloud.com");
    expect(connection.encryptedPassword).toMatch(/^v1:/);
    expect(connection.encryptedPassword).not.toContain("test-app-password");
    expect(decryptToken(connection.encryptedPassword)).toBe(
      "test-app-password",
    );
    expect(connection.folders).toEqual({ inbox: "INBOX" });
    db.connection.mockResolvedValue(connection);
    await expect(getICloudConnection("new-account")).resolves.toMatchObject({
      password: "test-app-password",
    });
  });

  it("does not store an account when authentication fails", async () => {
    vi.mocked(withICloudClient).mockRejectedValue(
      new Error("Authentication failed"),
    );
    await expect(
      connectICloud({
        userId: "owner",
        email: "owner@icloud.com",
        password: "invalid",
      }),
    ).rejects.toThrow();
    expect(db.create).not.toHaveBeenCalled();
  });

  it("reconnects the same owner without replacing the chosen folder mapping", async () => {
    db.findUnique.mockResolvedValue({
      id: "existing",
      userId: "owner",
      account: { provider: "icloud" },
    });
    await expect(
      connectICloud({
        userId: "owner",
        email: "owner@icloud.com",
        password: "replacement",
      }),
    ).resolves.toEqual({ emailAccountId: "existing" });
    expect(db.create).not.toHaveBeenCalled();
    expect(db.update.mock.calls[0][0].data).not.toHaveProperty("folders");
    expect(
      decryptToken(db.update.mock.calls[0][0].data.encryptedPassword),
    ).toBe("replacement");
  });
});
