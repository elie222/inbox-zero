// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import { useFolderSelection } from "./use-folder-selection";

const mockAddFilingFolderAction = vi.hoisted(() => vi.fn());
const mockRemoveFilingFolderAction = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock("@/utils/actions/drive", () => ({
  addFilingFolderAction: mockAddFilingFolderAction,
  removeFilingFolderAction: mockRemoveFilingFolderAction,
}));

vi.mock("@/components/Toast", () => ({
  toastError: mockToastError,
}));

describe("useFolderSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddFilingFolderAction.mockResolvedValue({ data: {} });
    mockRemoveFilingFolderAction.mockResolvedValue({ data: {} });
  });

  it("keeps successfully persisted folders selected when a sibling mutation fails", async () => {
    mockAddFilingFolderAction.mockImplementation(
      async (_emailAccountId: string, { folderId }: { folderId: string }) =>
        folderId === "child-b"
          ? { serverError: "Something went wrong" }
          : { data: {} },
    );
    const mutateFolders = vi.fn();
    const props = {
      emailAccountId: "email-account",
      availableFolders: [
        folder("parent"),
        folder("child-a", "parent"),
        folder("child-b", "parent"),
      ],
      savedFolders: [],
      mutateFolders,
    };

    const { result } = renderHook(() => useFolderSelection(props));

    await act(async () => {
      await result.current.handleFolderToggle(folder("parent"), true);
    });

    expect([...result.current.optimisticFolderIds].sort()).toEqual([
      "child-a",
      "parent",
    ]);
    expect(mockToastError).toHaveBeenCalledOnce();
    expect(mutateFolders).toHaveBeenCalled();
  });

  it("rolls back selection when persistence throws unexpectedly", async () => {
    mockAddFilingFolderAction.mockRejectedValue(new Error("Network error"));
    const mutateFolders = vi.fn();
    const props = {
      emailAccountId: "email-account",
      availableFolders: [folder("parent")],
      savedFolders: [],
      mutateFolders,
    };

    const { result } = renderHook(() => useFolderSelection(props));

    await act(async () => {
      await result.current.handleFolderToggle(folder("parent"), true);
    });

    expect(result.current.optimisticFolderIds).toEqual(new Set());
    expect(mockToastError).toHaveBeenCalledWith({
      title: "Error adding folder",
      description: "Please try again.",
    });
    expect(mutateFolders).toHaveBeenCalledOnce();
  });

  it("keeps both branches selected when two selected parents load children concurrently", async () => {
    const props = {
      emailAccountId: "email-account",
      availableFolders: [folder("parent-a"), folder("parent-b")],
      savedFolders: [savedFolder("parent-a"), savedFolder("parent-b")],
      mutateFolders: vi.fn(),
    };

    const { result } = renderHook(() => useFolderSelection(props));

    await act(async () => {
      result.current.handleChildrenLoaded(folder("parent-a"), [
        folder("child-a", "parent-a"),
      ]);
      result.current.handleChildrenLoaded(folder("parent-b"), [
        folder("child-b", "parent-b"),
      ]);
    });

    expect([...result.current.optimisticFolderIds].sort()).toEqual([
      "child-a",
      "child-b",
      "parent-a",
      "parent-b",
    ]);
    expect(mockAddFilingFolderAction).toHaveBeenCalledTimes(2);
  });

  it("loads children without selecting them when the parent is not selected", () => {
    const props = {
      emailAccountId: "email-account",
      availableFolders: [folder("parent")],
      savedFolders: [],
      mutateFolders: vi.fn(),
    };

    const { result } = renderHook(() => useFolderSelection(props));
    const child = folder("child", "parent");

    act(() => {
      result.current.handleChildrenLoaded(folder("parent"), [child]);
    });

    expect(result.current.childrenByParentId.get("parent")).toEqual([child]);
    expect(result.current.optimisticFolderIds).toEqual(new Set());
    expect(mockAddFilingFolderAction).not.toHaveBeenCalled();
    expect(mockRemoveFilingFolderAction).not.toHaveBeenCalled();
  });
});

function folder(id: string, parentId?: string): FolderItem {
  return {
    id,
    name: id,
    path: id,
    driveConnectionId: "drive-connection",
    provider: "google",
    parentId,
  };
}

function savedFolder(folderId: string): SavedFolder {
  return {
    id: `db-${folderId}`,
    folderId,
    folderName: folderId,
    folderPath: folderId,
    driveConnectionId: "drive-connection",
    driveConnection: { provider: "google" },
  };
}
