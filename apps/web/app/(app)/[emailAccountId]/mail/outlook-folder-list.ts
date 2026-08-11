import type { OutlookFolder } from "@/utils/outlook/folders";

export type MailSidebarFolder = OutlookFolder & { depth: number };

export function getMailSidebarFolders(
  folders: OutlookFolder[],
  depth = 0,
): MailSidebarFolder[] {
  return folders.flatMap((folder) => {
    const childDepth = folder.systemType ? depth : depth + 1;
    const children = getMailSidebarFolders(folder.childFolders, childDepth);
    return folder.systemType ? children : [{ ...folder, depth }, ...children];
  });
}
