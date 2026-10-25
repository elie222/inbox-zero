import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { getOutlookClientForEmailId } from "@/utils/email-account-client";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";
import {
  checkMailboxClaim,
  getStandbyEmailAccounts,
  getStandbyResponse,
  takeOverMailbox,
} from "@/utils/outlook/mailbox-claim";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma", () => ({
  default: { emailAccount: { findMany: vi.fn() } },
}));
vi.mock("@/utils/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));
vi.mock("@/utils/email-account-client", () => ({
  getOutlookClientForEmailId: vi.fn(),
}));
vi.mock("@/utils/outlook/watch", () => ({
  getOutlookNotificationUrl: () =>
    new URL("https://mac.example.ts.net/api/outlook/webhook"),
}));

const logger = createTestLogger();
const emailAccountId = "account-1";
const MAC = "https://mac.example.ts.net/api/outlook/webhook";
const PC = "https://pc.example.ts.net/api/outlook/webhook";

describe("mailbox claim", () => {
  let subscriptions: Array<Record<string, unknown>>;
  let deleted: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    deleted = [];
    subscriptions = [];
    const client = {
      api: (path: string) => ({
        get: async () => ({ value: subscriptions }),
        delete: async () => {
          deleted.push(path.replace("/subscriptions/", ""));
        },
      }),
    };
    vi.mocked(getOutlookClientForEmailId).mockResolvedValue({
      getClient: () => client,
    } as never);
  });

  it("owns the mailbox when no other copy holds a webhook", async () => {
    subscriptions = [subscription("mine", MAC)];

    const claim = await checkMailboxClaim({ emailAccountId, logger });

    expect(claim).toEqual({ status: "owner" });
    expect(deleted).toEqual([]);
  });

  it("stands by when only another copy holds a live webhook", async () => {
    subscriptions = [subscription("theirs", PC)];

    const claim = await checkMailboxClaim({ emailAccountId, logger });

    expect(claim).toEqual({
      status: "standby",
      ownerHosts: ["pc.example.ts.net"],
    });
  });

  it("ignores expired webhooks and other resources", async () => {
    subscriptions = [
      subscription("expired", PC, -60_000),
      subscription("calendar", PC, 60_000, "me/events"),
    ];

    const claim = await checkMailboxClaim({ emailAccountId, logger });

    expect(claim).toEqual({ status: "owner" });
  });

  it("settles a two-copy conflict the same way on both sides", async () => {
    // mac < pc alphabetically, so the Mac keeps it and drops nothing.
    subscriptions = [subscription("mine", MAC), subscription("theirs", PC)];

    const claim = await checkMailboxClaim({ emailAccountId, logger });

    expect(claim).toEqual({ status: "owner" });
    expect(deleted).toEqual([]);
  });

  it("drops its own webhook when it loses a conflict", async () => {
    const ZED = "https://zed.example.ts.net/api/outlook/webhook";
    vi.doMock("@/utils/outlook/watch", () => ({
      getOutlookNotificationUrl: () => new URL(ZED),
    }));
    const { checkMailboxClaim: checkAsZed } = await importFresh();

    subscriptions = [subscription("zed-own", ZED), subscription("mac", MAC)];
    const claim = await checkAsZed({ emailAccountId, logger });

    expect(claim).toEqual({
      status: "standby",
      ownerHosts: ["mac.example.ts.net"],
    });
    expect(deleted).toEqual(["zed-own"]);
    vi.doUnmock("@/utils/outlook/watch");
  });

  it("takeover removes the other copies' webhooks only", async () => {
    subscriptions = [subscription("mine", MAC), subscription("theirs", PC)];

    const result = await takeOverMailbox({ emailAccountId, logger });

    expect(result.releasedHosts).toEqual(["pc.example.ts.net"]);
    expect(deleted).toEqual(["theirs"]);
  });

  describe("standby accounts", () => {
    beforeEach(() => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
        { id: "owned", userId: "user-1" },
        { id: "standing-by", userId: "user-2" },
      ] as never);
      vi.mocked(getOutlookClientForEmailId).mockImplementation((async ({
        emailAccountId: id,
      }: {
        emailAccountId: string;
      }) => ({
        getClient: () => ({
          api: () => ({
            get: async () => ({
              value: [
                id === "owned"
                  ? subscription("mine", MAC)
                  : subscription("theirs", PC),
              ],
            }),
            delete: async () => {},
          }),
        }),
      })) as never);
    });

    it("lists only the accounts owned by another copy", async () => {
      await expect(getStandbyEmailAccounts(logger)).resolves.toEqual([
        {
          id: "standing-by",
          userId: "user-2",
          ownerHosts: ["pc.example.ts.net"],
        },
      ]);
    });

    it("answers with the standby response, or null when every account is owned", async () => {
      const response = await getStandbyResponse(logger);
      await expect(response?.json()).resolves.toEqual({
        skipped: "standby",
        ownerHosts: ["pc.example.ts.net"],
      });

      vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
        { id: "owned", userId: "user-1" },
      ] as never);
      await expect(getStandbyResponse(logger)).resolves.toBeNull();
    });
  });
});

function subscription(
  id: string,
  notificationUrl: string,
  expiresInMs = 60 * 60 * 1000,
  resource = "/me/messages",
) {
  return {
    id,
    notificationUrl,
    resource,
    expirationDateTime: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

async function importFresh() {
  vi.resetModules();
  return import("@/utils/outlook/mailbox-claim");
}
