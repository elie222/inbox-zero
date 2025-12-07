import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOutlookFolderTree,
  getOutlookRootFolders,
  getOutlookChildFolders,
  type OutlookFolder,
} from "./folders";
import type { OutlookClient } from "./client";

vi.mock("server-only", () => ({}));

// Mock the retry wrapper to just execute the function directly
vi.mock("@/utils/outlook/retry", () => ({
  withOutlookRetry: <T>(fn: () => Promise<T>) => fn(),
}));

function createMockClient(
  mockResponses: Record<string, { value: unknown[] }>,
): OutlookClient {
  const mockGet = vi.fn();
  const mockApi = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    top: vi.fn().mockReturnThis(),
    expand: vi.fn().mockReturnThis(),
    get: mockGet,
  });

  mockGet.mockImplementation(() => {
    const lastCall = mockApi.mock.calls[mockApi.mock.calls.length - 1];
    const endpoint = lastCall?.[0] as string;

    // Sort patterns by length (longest first) to match more specific patterns first
    const sortedPatterns = Object.entries(mockResponses).sort(
      ([a], [b]) => b.length - a.length,
    );

    for (const [pattern, response] of sortedPatterns) {
      if (endpoint.includes(pattern)) {
        return Promise.resolve(response);
      }
    }

    return Promise.resolve({ value: [] });
  });

  return {
    getClient: () => ({
      api: mockApi,
    }),
  } as unknown as OutlookClient;
}

describe("getOutlookFolderTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return root folders with their children from initial fetch", async () => {
    const mockClient = createMockClient({
      "/me/mailFolders": {
        value: [
          {
            id: "inbox-id",
            displayName: "Inbox",
            childFolderCount: 1,
            childFolders: [
              {
                id: "child1-id",
                displayName: "Child1",
                childFolderCount: 0,
                childFolders: [],
              },
            ],
          },
        ],
      },
    });

    const result = await getOutlookFolderTree(mockClient, 2);

    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("Inbox");
    expect(result[0].childFolders).toHaveLength(1);
    expect(result[0].childFolders[0].displayName).toBe("Child1");
  });

  it("should recursively fetch nested folders beyond initial 2 levels", async () => {
    const mockClient = createMockClient({
      "/me/mailFolders": {
        value: [
          {
            id: "inbox-id",
            displayName: "Inbox",
            childFolderCount: 1,
            childFolders: [
              {
                id: "level1-id",
                displayName: "Level1",
                childFolderCount: 1, // Has children that need fetching
                childFolders: [], // Empty - needs to be fetched
              },
            ],
          },
        ],
      },
      "level1-id/childFolders": {
        value: [
          {
            id: "level2-id",
            displayName: "Level2",
            childFolderCount: 1, // Has children
            childFolders: [], // Empty - needs to be fetched
          },
        ],
      },
      "level2-id/childFolders": {
        value: [
          {
            id: "level3-id",
            displayName: "Level3",
            childFolderCount: 0,
            childFolders: [],
          },
        ],
      },
    });

    const result = await getOutlookFolderTree(mockClient, 6);

    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("Inbox");

    const level1 = result[0].childFolders[0];
    expect(level1.displayName).toBe("Level1");

    const level2 = level1.childFolders[0];
    expect(level2.displayName).toBe("Level2");

    const level3 = level2.childFolders[0];
    expect(level3.displayName).toBe("Level3");
  });

  it("should handle multiple root folders with nested children", async () => {
    const mockClient = createMockClient({
      "/me/mailFolders": {
        value: [
          {
            id: "inbox-id",
            displayName: "Inbox",
            childFolderCount: 1,
            childFolders: [
              {
                id: "inbox-child-id",
                displayName: "InboxChild",
                childFolderCount: 1, // Has children
                childFolders: [],
              },
            ],
          },
          {
            id: "drafts-id",
            displayName: "Drafts",
            childFolderCount: 0,
            childFolders: [],
          },
        ],
      },
      "inbox-child-id/childFolders": {
        value: [
          {
            id: "nested-id",
            displayName: "NestedFolder",
            childFolderCount: 0,
            childFolders: [],
          },
        ],
      },
    });

    const result = await getOutlookFolderTree(mockClient, 6);

    expect(result).toHaveLength(2);

    const inbox = result.find((f) => f.displayName === "Inbox");
    expect(inbox?.childFolders[0].displayName).toBe("InboxChild");
    expect(inbox?.childFolders[0].childFolders[0].displayName).toBe(
      "NestedFolder",
    );

    const drafts = result.find((f) => f.displayName === "Drafts");
    expect(drafts?.childFolders).toHaveLength(0);
  });

  it("should respect maxDepth and not fetch beyond it", async () => {
    const apiCallTracker: string[] = [];

    const mockGet = vi.fn();
    const mockApi = vi.fn().mockImplementation((endpoint: string) => {
      apiCallTracker.push(endpoint);
      return {
        select: vi.fn().mockReturnThis(),
        top: vi.fn().mockReturnThis(),
        expand: vi.fn().mockReturnThis(),
        get: mockGet,
      };
    });

    mockGet.mockImplementation(() => {
      const lastEndpoint = apiCallTracker[apiCallTracker.length - 1];

      if (lastEndpoint === "/me/mailFolders") {
        return Promise.resolve({
          value: [
            {
              id: "root-id",
              displayName: "Root",
              childFolderCount: 1,
              childFolders: [
                {
                  id: "level1-id",
                  displayName: "Level1",
                  childFolderCount: 1, // Has children
                  childFolders: [],
                },
              ],
            },
          ],
        });
      }

      if (lastEndpoint.includes("level1-id/childFolders")) {
        return Promise.resolve({
          value: [
            {
              id: "level2-id",
              displayName: "Level2",
              childFolderCount: 1, // Has children
              childFolders: [],
            },
          ],
        });
      }

      if (lastEndpoint.includes("level2-id/childFolders")) {
        return Promise.resolve({
          value: [
            {
              id: "level3-id",
              displayName: "Level3",
              childFolderCount: 0,
              childFolders: [],
            },
          ],
        });
      }

      return Promise.resolve({ value: [] });
    });

    const mockClient = {
      getClient: () => ({
        api: mockApi,
      }),
    } as unknown as OutlookClient;

    // With maxDepth=3, should fetch root (1), level1's children (2),
    // but NOT level2's children (would be depth 3)
    await getOutlookFolderTree(mockClient, 3);

    // Should NOT have called the API for level2's children
    const level2ChildCalls = apiCallTracker.filter((call) =>
      call.includes("level2-id/childFolders"),
    );
    expect(level2ChildCalls).toHaveLength(0);
  });

  it("should handle folders with no children gracefully", async () => {
    const mockClient = createMockClient({
      "/me/mailFolders": {
        value: [
          {
            id: "empty-id",
            displayName: "EmptyFolder",
            childFolderCount: 0,
            childFolders: [],
          },
        ],
      },
    });

    const result = await getOutlookFolderTree(mockClient, 6);

    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("EmptyFolder");
    expect(result[0].childFolders).toHaveLength(0);
  });

  it("should only fetch children for folders with childFolderCount > 0", async () => {
    const apiCallTracker: string[] = [];

    const mockGet = vi.fn();
    const mockApi = vi.fn().mockImplementation((endpoint: string) => {
      apiCallTracker.push(endpoint);
      return {
        select: vi.fn().mockReturnThis(),
        top: vi.fn().mockReturnThis(),
        expand: vi.fn().mockReturnThis(),
        get: mockGet,
      };
    });

    mockGet.mockImplementation(() => {
      const lastEndpoint = apiCallTracker[apiCallTracker.length - 1];

      if (lastEndpoint === "/me/mailFolders") {
        return Promise.resolve({
          value: [
            {
              id: "no-children-id",
              displayName: "NoChildren",
              childFolderCount: 0, // No children
              childFolders: [],
            },
            {
              id: "has-children-id",
              displayName: "HasChildren",
              childFolderCount: 1, // Has children
              childFolders: [],
            },
          ],
        });
      }

      if (lastEndpoint.includes("has-children-id/childFolders")) {
        return Promise.resolve({
          value: [
            {
              id: "child-id",
              displayName: "Child",
              childFolderCount: 0,
              childFolders: [],
            },
          ],
        });
      }

      return Promise.resolve({ value: [] });
    });

    const mockClient = {
      getClient: () => ({
        api: mockApi,
      }),
    } as unknown as OutlookClient;

    await getOutlookFolderTree(mockClient, 6);

    // Should NOT have fetched children for no-children-id
    const noChildrenCalls = apiCallTracker.filter((call) =>
      call.includes("no-children-id/childFolders"),
    );
    expect(noChildrenCalls).toHaveLength(0);

    // SHOULD have fetched children for has-children-id
    const hasChildrenCalls = apiCallTracker.filter((call) =>
      call.includes("has-children-id/childFolders"),
    );
    expect(hasChildrenCalls).toHaveLength(1);
  });
});

describe("getOutlookRootFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should convert MailFolder to OutlookFolder format", async () => {
    const mockClient = createMockClient({
      "/me/mailFolders": {
        value: [
          {
            id: "folder-id",
            displayName: "TestFolder",
            childFolderCount: 1,
            childFolders: [
              {
                id: "child-id",
                displayName: "ChildFolder",
                childFolderCount: 0,
                childFolders: [],
              },
            ],
          },
        ],
      },
    });

    const result = await getOutlookRootFolders(mockClient);

    expect(result).toEqual([
      {
        id: "folder-id",
        displayName: "TestFolder",
        childFolderCount: 1,
        childFolders: [
          {
            id: "child-id",
            displayName: "ChildFolder",
            childFolderCount: 0,
            childFolders: [],
          },
        ],
      },
    ]);
  });

  it("should handle null/undefined values in MailFolder", async () => {
    const mockClient = createMockClient({
      "/me/mailFolders": {
        value: [
          {
            id: null,
            displayName: undefined,
            childFolderCount: null,
            childFolders: null,
          },
        ],
      },
    });

    const result = await getOutlookRootFolders(mockClient);

    expect(result).toEqual([
      {
        id: "",
        displayName: "",
        childFolderCount: 0,
        childFolders: [],
      },
    ]);
  });
});

describe("getOutlookChildFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch children for a specific folder", async () => {
    const mockClient = createMockClient({
      "parent-id/childFolders": {
        value: [
          {
            id: "child1-id",
            displayName: "Child1",
            childFolderCount: 0,
            childFolders: [],
          },
          {
            id: "child2-id",
            displayName: "Child2",
            childFolderCount: 0,
            childFolders: [],
          },
        ],
      },
    });

    const result = await getOutlookChildFolders(mockClient, "parent-id");

    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe("Child1");
    expect(result[1].displayName).toBe("Child2");
  });
});
