import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { pullGoogleContacts } from "./google";

const connectionsList = vi.fn();

vi.mock("@/utils/prisma");
vi.mock("@/utils/gmail/client", () => ({
  getContactsClientWithRefresh: vi.fn(async () => ({
    people: { connections: { list: connectionsList } },
  })),
}));

const logger = createTestLogger();
const EMAIL_ACCOUNT_ID = "email-account-1";

describe("pullGoogleContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      googleContactsSyncToken: "stored-token",
      account: {
        provider: "google",
        access_token: "access",
        refresh_token: "refresh",
        expires_at: null,
      },
    } as never);
    prisma.emailAccount.update.mockResolvedValue({} as never);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.findUnique.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({} as never);
    connectionsList.mockResolvedValue({
      data: { connections: [], nextSyncToken: "fresh-token" },
    });
  });

  it("resumes from the stored token by default", async () => {
    await pullGoogleContacts({ emailAccountId: EMAIL_ACCOUNT_ID, logger });

    expect(connectionsList).toHaveBeenCalledWith(
      expect.objectContaining({ syncToken: "stored-token" }),
    );
  });

  // A stored token only replays what changed since it was issued, so anyone a
  // previous pull skipped would stay invisible forever
  it("ignores the stored token on a full sync", async () => {
    await pullGoogleContacts({
      emailAccountId: EMAIL_ACCOUNT_ID,
      full: true,
      logger,
    });

    expect(connectionsList).toHaveBeenCalledWith(
      expect.not.objectContaining({ syncToken: expect.anything() }),
    );
  });

  it("stores a phone-only contact a full sync turns up", async () => {
    connectionsList.mockResolvedValue({
      data: {
        connections: [
          {
            resourceName: "people/c1",
            names: [{ displayName: "Alex Bois" }],
            phoneNumbers: [{ value: "+1 555 0123", type: "mobile" }],
          },
        ],
        nextSyncToken: "fresh-token",
      },
    });

    const result = await pullGoogleContacts({
      emailAccountId: EMAIL_ACCOUNT_ID,
      full: true,
      logger,
    });

    expect(result).toMatchObject({ created: 1, skipped: 0 });
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailAccountId: EMAIL_ACCOUNT_ID,
        email: null,
        name: "Alex Bois",
        googleResourceName: "people/c1",
      }),
    });
  });

  it("saves the new token so the next incremental pull resumes", async () => {
    await pullGoogleContacts({
      emailAccountId: EMAIL_ACCOUNT_ID,
      full: true,
      logger,
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleContactsSyncToken: "fresh-token",
        }),
      }),
    );
  });
});
