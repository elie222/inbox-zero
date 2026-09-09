import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetLabels,
  mockGetLabelById,
  mockGetInboxStats,
  mockGetFolderCounts,
  mockRedisGet,
  mockRedisSet,
  providerName,
} = vi.hoisted(() => ({
  mockGetLabels: vi.fn(),
  mockGetLabelById: vi.fn(),
  mockGetInboxStats: vi.fn(),
  mockGetFolderCounts: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  providerName: { current: "google" as "google" | "microsoft" },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createScopedLogger } =
    await vi.importActual<typeof import("@/utils/logger")>("@/utils/logger");
  const logger = createScopedLogger("test/labels-counts");

  return {
    withEmailProvider:
      (
        _name: string,
        handler: (
          request: NextRequest & Record<string, unknown>,
        ) => Promise<Response>,
      ) =>
      (request: NextRequest) =>
        handler(
          Object.assign(request, {
            auth: { emailAccountId: "email-account-id" },
            logger,
            emailProvider: {
              get name() {
                return providerName.current;
              },
              getLabels: mockGetLabels,
              getLabelById: mockGetLabelById,
              getInboxStats: mockGetInboxStats,
              getFolderCounts: mockGetFolderCounts,
            },
          }),
        ),
  };
});

import { GET } from "./route";

const request = () =>
  new NextRequest("http://localhost:3000/api/labels/counts");

function counts(body: { counts: Array<{ id: string }> }) {
  return body.counts.map((count) => count.id);
}

describe("GET /api/labels/counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerName.current = "google";
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    mockGetLabels.mockResolvedValue([{ id: "Label_1", name: "Work" }]);
    mockGetLabelById.mockImplementation(async (id: string) => ({
      id,
      name: id,
      threadsTotal: 10,
      threadsUnread: 3,
    }));
  });

  it("returns unread and total counts per label and category", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(counts(body)).toEqual([
      "INBOX",
      "DRAFT",
      "SENT",
      "CATEGORY_PERSONAL",
      "CATEGORY_SOCIAL",
      "CATEGORY_PROMOTIONS",
      "CATEGORY_UPDATES",
      "CATEGORY_FORUMS",
      "Label_1",
    ]);
    expect(body.counts[0]).toEqual({
      id: "INBOX",
      name: "Inbox",
      kind: "system",
      total: 10,
      unread: 3,
    });
    expect(body.counts.at(-1)).toMatchObject({
      id: "Label_1",
      name: "Work",
      kind: "label",
    });
    expect(body.partial).toBe(false);
  });

  it("caches the response and serves later requests from the cache", async () => {
    const first = await GET(request());
    const firstBody = await first.json();

    expect(mockRedisSet).toHaveBeenCalledWith(
      "label-counts:email-account-id",
      firstBody,
      { ex: 60 },
    );

    mockGetLabelById.mockClear();
    mockGetLabels.mockClear();
    mockRedisGet.mockResolvedValue(firstBody);

    const second = await GET(request());

    expect(await second.json()).toEqual(firstBody);
    expect(mockGetLabels).not.toHaveBeenCalled();
    expect(mockGetLabelById).not.toHaveBeenCalled();
  });

  it("keeps the other counts when a single label lookup fails", async () => {
    mockGetLabelById.mockImplementation(async (id: string) => {
      if (id === "CATEGORY_SOCIAL") throw new Error("Gmail is unhappy");
      return { id, name: id, threadsTotal: 4, threadsUnread: 1 };
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(counts(body)).not.toContain("CATEGORY_SOCIAL");
    expect(counts(body)).toContain("INBOX");
    expect(body.partial).toBe(true);
  });

  it("degrades to an empty result when the provider fails", async () => {
    mockGetLabels.mockRejectedValue(new Error("Gmail is down"));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counts: [], partial: true });
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it("still returns counts when the cache is unavailable", async () => {
    mockRedisGet.mockRejectedValue(new Error("redis down"));
    mockRedisSet.mockRejectedValue(new Error("redis down"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(counts(body)).toContain("INBOX");
  });

  it("returns system and custom folder counts for Outlook", async () => {
    providerName.current = "microsoft";
    mockGetFolderCounts.mockResolvedValue([
      {
        id: "outlook-inbox-id",
        name: "Inbox",
        systemType: "INBOX",
        total: 7,
        unread: 2,
      },
      {
        id: "folder-projects",
        name: "Projects",
        total: 4,
        unread: 1,
      },
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({
      counts: [
        { id: "INBOX", name: "Inbox", kind: "system", total: 7, unread: 2 },
        {
          id: "folder-projects",
          name: "Projects",
          kind: "folder",
          total: 4,
          unread: 1,
        },
      ],
      partial: false,
    });
    expect(mockGetLabelById).not.toHaveBeenCalled();
    expect(mockGetInboxStats).not.toHaveBeenCalled();
  });
});
