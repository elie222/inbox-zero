import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";
import { createFastmailClient } from "@/utils/fastmail/client";
import { handleAccountLinking } from "@/utils/oauth/account-linking";
import { linkFastmailAppTokenAction } from "./fastmail-app-token";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_FASTMAIL_ENABLED: true } }));
vi.mock("@/utils/fastmail/client", () => ({ createFastmailClient: vi.fn() }));
vi.mock("@/utils/oauth/account-linking", () => ({
  handleAccountLinking: vi.fn(),
}));
vi.mock("@/utils/user/merge-account", () => ({ mergeAccount: vi.fn() }));
vi.mock("@/utils/email/fastmail", () => ({
  FastmailProvider: class {
    getEmailChanges() {
      return Promise.resolve({ newState: "baseline" });
    }
  },
}));
vi.mock("@/utils/actions/safe-action", () => {
  const client = {
    metadata: () => client,
    inputSchema: () => client,
    action: (handler: unknown) => handler,
  };
  return { actionClientUser: client };
});

describe("Fastmail token connection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createFastmailClient).mockResolvedValue(client());
    vi.mocked(handleAccountLinking).mockResolvedValue({
      type: "continue_create",
    });
    prisma.account.create.mockResolvedValue({ id: "new-account" } as never);
  });

  it.each([
    { isReadOnly: true, submission: true },
    { isReadOnly: false, submission: false },
  ])("rejects unsupported token permissions (%j)", async (permissions) => {
    vi.mocked(createFastmailClient).mockResolvedValue(client(permissions));
    await expect(connect()).rejects.toThrow(
      "mail read/write and sending permissions",
    );
    expect(prisma.account.create).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("records the connection baseline without importing historical mail", async () => {
    await connect();
    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "fastmail",
          type: "app_token",
          access_token: "fixture-token",
          emailAccount: {
            create: expect.objectContaining({
              lastSyncedHistoryId: "baseline",
              fastmailSyncStartedAt: expect.any(Date),
            }),
          },
        }),
      }),
    );
  });

  it("rejects a reconnect for an account the user does not own", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(null);
    await expect(connect("other-account")).rejects.toThrow(
      "account you are reconnecting",
    );
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("refuses to overwrite another user's connected account", async () => {
    vi.mocked(handleAccountLinking).mockResolvedValue({
      type: "redirect",
      response: NextResponse.redirect("http://localhost/accounts"),
    });
    await expect(connect()).rejects.toThrow("already linked to another user");
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("rotates an existing token without clearing durable synchronization state", async () => {
    vi.mocked(handleAccountLinking).mockResolvedValue({
      type: "update_tokens",
      existingAccountId: "existing-account",
    });
    await connect();
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "existing-account" },
      data: {
        providerAccountId: "mail-account",
        type: "app_token",
        access_token: "fixture-token",
        refresh_token: null,
        expires_at: null,
      },
    });
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(prisma.fastmailSyncItem.deleteMany).not.toHaveBeenCalled();
  });
});

function connect(reconnectEmailAccountId?: string) {
  const handler = linkFastmailAppTokenAction as unknown as (
    input: unknown,
  ) => Promise<unknown>;
  return handler({
    ctx: {
      userId: "fixture-user",
      logger: createScopedLogger("test"),
      session: { session: { emailOtp: false } },
    },
    parsedInput: { appToken: "fixture-token", reconnectEmailAccountId },
  });
}

function client({ isReadOnly = false, submission = true } = {}) {
  return {
    accountId: "mail-account",
    session: {
      username: "fixture@example.com",
      accounts: {
        "mail-account": {
          isReadOnly,
          accountCapabilities: submission
            ? { "urn:ietf:params:jmap:submission": {} }
            : {},
        },
      },
    },
  } as unknown as Awaited<ReturnType<typeof createFastmailClient>>;
}
