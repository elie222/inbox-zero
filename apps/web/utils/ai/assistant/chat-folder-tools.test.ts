import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createTestLogger } from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import { FOLDER_SEPARATOR, type OutlookFolder } from "@/utils/outlook/folders";
import {
  createOrGetFolderTool,
  listFoldersTool,
  moveThreadsToFolderTool,
} from "./chat-folder-tools";

vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();
const TEST_EMAIL = "user@test.com";
const toolOptions = {
  email: TEST_EMAIL,
  emailAccountId: "email-account-1",
  provider: "microsoft",
  logger,
};

describe("chat folder tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists nested Outlook folders without exposing folder IDs", async () => {
    const folders: OutlookFolder[] = [
      {
        id: "folder-1",
        displayName: "Operations",
        childFolderCount: 1,
        childFolders: [
          {
            id: "folder-2",
            displayName: "Reports",
            childFolderCount: 0,
            childFolders: [],
          },
        ],
      },
    ];

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getFolders: vi.fn().mockResolvedValue(folders),
      }),
    );

    const toolInstance = listFoldersTool(toolOptions);

    const result = await (toolInstance.execute as any)({});

    expect(result).toEqual({
      count: 2,
      folders: [
        {
          name: "Operations",
          path: "Operations",
          childFolderCount: 1,
        },
        {
          name: "Reports",
          path: `Operations${FOLDER_SEPARATOR}Reports`,
          childFolderCount: 0,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("folder-1");
    expect(JSON.stringify(result)).not.toContain("folder-2");
  });

  it("reuses an existing Outlook folder by normalized name", async () => {
    const getFolders = vi.fn().mockResolvedValue([
      {
        id: "folder-1",
        displayName: "Operations",
        childFolderCount: 0,
        childFolders: [],
      },
    ] satisfies OutlookFolder[]);
    const getOrCreateFolderIdByName = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getFolders,
        getOrCreateFolderIdByName,
      }),
    );

    const toolInstance = createOrGetFolderTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      name: " operations ",
    });

    expect(result).toEqual({
      created: false,
      folder: {
        name: "Operations",
        path: "Operations",
        childFolderCount: 0,
      },
    });
    expect(getOrCreateFolderIdByName).not.toHaveBeenCalled();
  });

  it("creates a root Outlook folder when no normalized match exists", async () => {
    const getOrCreateFolderIdByName = vi.fn().mockResolvedValue("folder-1");

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getFolders: vi.fn().mockResolvedValue([]),
        getOrCreateFolderIdByName,
      }),
    );

    const toolInstance = createOrGetFolderTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      name: "Finance",
    });

    expect(getOrCreateFolderIdByName).toHaveBeenCalledWith("Finance");
    expect(result).toEqual({
      created: true,
      folder: {
        name: "Finance",
        path: "Finance",
        childFolderCount: 0,
      },
    });
  });

  it("does not treat folder names containing slashes as paths", async () => {
    const getOrCreateFolderIdByName = vi.fn().mockResolvedValue("folder-1");

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getFolders: vi.fn().mockResolvedValue([]),
        getOrCreateFolderIdByName,
      }),
    );

    const toolInstance = createOrGetFolderTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      name: "Client / invoices",
    });

    expect(getOrCreateFolderIdByName).toHaveBeenCalledWith("Client / invoices");
    expect(result).toEqual({
      created: true,
      folder: {
        name: "Client / invoices",
        path: "Client / invoices",
        childFolderCount: 0,
      },
    });
  });

  it("prefers an exact slash-containing folder name over a slash path alias", async () => {
    const getOrCreateFolderIdByName = vi.fn();
    const moveThreadToFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getFolders: vi.fn().mockResolvedValue([
          {
            id: "folder-root-slash",
            displayName: "Operations / Reports",
            childFolderCount: 0,
            childFolders: [],
          },
          {
            id: "folder-operations",
            displayName: "Operations",
            childFolderCount: 1,
            childFolders: [
              {
                id: "folder-reports",
                displayName: "Reports",
                childFolderCount: 0,
                childFolders: [],
              },
            ],
          },
        ] satisfies OutlookFolder[]),
        getOrCreateFolderIdByName,
        moveThreadToFolder,
      }),
    );

    const toolInstance = moveThreadsToFolderTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      threadIds: ["thread-1"],
      folderName: "Operations / Reports",
    });

    expect(getOrCreateFolderIdByName).not.toHaveBeenCalled();
    expect(moveThreadToFolder).toHaveBeenCalledWith(
      "thread-1",
      TEST_EMAIL,
      "folder-root-slash",
    );
    expect(result).toEqual({
      success: true,
      folderName: "Operations / Reports",
      requestedCount: 1,
      successCount: 1,
      failedCount: 0,
      failedThreadIds: [],
    });
  });

  it("accepts slash path aliases for nested folders after exact name matching", async () => {
    const getOrCreateFolderIdByName = vi.fn();
    const moveThreadToFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getFolders: vi.fn().mockResolvedValue([
          {
            id: "folder-operations",
            displayName: "Operations",
            childFolderCount: 1,
            childFolders: [
              {
                id: "folder-reports",
                displayName: "Reports",
                childFolderCount: 0,
                childFolders: [],
              },
            ],
          },
        ] satisfies OutlookFolder[]),
        getOrCreateFolderIdByName,
        moveThreadToFolder,
      }),
    );

    const toolInstance = moveThreadsToFolderTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      threadIds: ["thread-1"],
      folderName: "Operations / Reports",
    });

    expect(getOrCreateFolderIdByName).not.toHaveBeenCalled();
    expect(moveThreadToFolder).toHaveBeenCalledWith(
      "thread-1",
      TEST_EMAIL,
      "folder-reports",
    );
    expect(result).toEqual({
      success: true,
      folderName: "Operations / Reports",
      requestedCount: 1,
      successCount: 1,
      failedCount: 0,
      failedThreadIds: [],
    });
  });

  it("moves deduped Outlook thread IDs to the resolved folder", async () => {
    const getOrCreateFolderIdByName = vi.fn().mockResolvedValue("folder-1");
    const moveThreadToFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getOrCreateFolderIdByName,
        moveThreadToFolder,
      }),
    );

    const toolInstance = moveThreadsToFolderTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      threadIds: ["thread-1", "thread-1", "thread-2"],
      folderName: "Finance",
    });

    expect(getOrCreateFolderIdByName).toHaveBeenCalledWith("Finance");
    expect(moveThreadToFolder).toHaveBeenCalledTimes(2);
    expect(moveThreadToFolder).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      TEST_EMAIL,
      "folder-1",
    );
    expect(moveThreadToFolder).toHaveBeenNthCalledWith(
      2,
      "thread-2",
      TEST_EMAIL,
      "folder-1",
    );
    expect(result).toEqual({
      success: true,
      folderName: "Finance",
      requestedCount: 2,
      successCount: 2,
      failedCount: 0,
      failedThreadIds: [],
    });
  });

  it("moves Outlook threads to an existing nested folder by path", async () => {
    const getOrCreateFolderIdByName = vi.fn();
    const moveThreadToFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getFolders: vi.fn().mockResolvedValue([
          {
            id: "folder-1",
            displayName: "Operations",
            childFolderCount: 1,
            childFolders: [
              {
                id: "folder-2",
                displayName: "Reports",
                childFolderCount: 0,
                childFolders: [],
              },
            ],
          },
        ] satisfies OutlookFolder[]),
        getOrCreateFolderIdByName,
        moveThreadToFolder,
      }),
    );

    const toolInstance = moveThreadsToFolderTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      threadIds: ["thread-1"],
      folderName: `Operations${FOLDER_SEPARATOR}Reports`,
    });

    expect(getOrCreateFolderIdByName).not.toHaveBeenCalled();
    expect(moveThreadToFolder).toHaveBeenCalledWith(
      "thread-1",
      TEST_EMAIL,
      "folder-2",
    );
    expect(result).toEqual({
      success: true,
      folderName: `Operations${FOLDER_SEPARATOR}Reports`,
      requestedCount: 1,
      successCount: 1,
      failedCount: 0,
      failedThreadIds: [],
    });
  });
});
