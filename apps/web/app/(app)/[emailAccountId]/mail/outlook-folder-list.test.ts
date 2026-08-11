import { describe, expect, it } from "vitest";
import type { OutlookFolder } from "@/utils/outlook/folders";
import { getMailSidebarFolders } from "./outlook-folder-list";

function folder(
  id: string,
  childFolders: OutlookFolder[] = [],
  systemType?: OutlookFolder["systemType"],
): OutlookFolder {
  return {
    id,
    displayName: id,
    childFolders,
    childFolderCount: childFolders.length,
    totalItemCount: 0,
    unreadItemCount: 0,
    systemType,
  };
}

describe("getMailSidebarFolders", () => {
  it("omits duplicate system rows but keeps folders nested below them", () => {
    const result = getMailSidebarFolders([
      folder(
        "inbox-id",
        [folder("inbox-child", [folder("inbox-grandchild")])],
        "INBOX",
      ),
      folder("root-folder"),
    ]);

    expect(result.map(({ id, depth }) => ({ id, depth }))).toEqual([
      { id: "inbox-child", depth: 0 },
      { id: "inbox-grandchild", depth: 1 },
      { id: "root-folder", depth: 0 },
    ]);
  });

  it("returns no rows when Outlook only provides system folders", () => {
    expect(
      getMailSidebarFolders([
        folder("inbox-id", [], "INBOX"),
        folder("sent-id", [], "SENT"),
      ]),
    ).toEqual([]);
  });
});
