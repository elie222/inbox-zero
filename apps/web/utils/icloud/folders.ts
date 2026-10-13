import { z } from "zod";
import { SafeError } from "@/utils/error";

export const iCloudFoldersSchema = z.object({
  inbox: z.string().min(1).max(1024),
  sent: z.string().min(1).max(1024).optional(),
  drafts: z.string().min(1).max(1024).optional(),
  archive: z.string().min(1).max(1024).optional(),
  trash: z.string().min(1).max(1024).optional(),
  junk: z.string().min(1).max(1024).optional(),
});

export type ICloudFolders = z.infer<typeof iCloudFoldersSchema>;
export type ICloudFolder = {
  path: string;
  flags: Set<string>;
  specialUse?: string;
};

const roles = {
  inbox: "\\Inbox",
  sent: "\\Sent",
  drafts: "\\Drafts",
  archive: "\\Archive",
  trash: "\\Trash",
  junk: "\\Junk",
} as const;

export function discoverICloudFolders(
  folders: ICloudFolder[],
): Partial<ICloudFolders> {
  const result: Partial<ICloudFolders> = {};
  for (const folder of folders) {
    if (folder.flags.has("\\Noselect")) continue;
    for (const [role, specialUse] of Object.entries(roles)) {
      if (
        folder.specialUse === specialUse ||
        (role === "inbox" && folder.path.toUpperCase() === "INBOX")
      )
        result[role as keyof ICloudFolders] ??= folder.path;
    }
  }
  return result;
}

export function validateICloudFolders(
  input: unknown,
  folders: ICloudFolder[],
): ICloudFolders {
  const mapping = iCloudFoldersSchema.parse(input);
  const paths = Object.values(mapping).filter((path) => path !== undefined);
  if (new Set(paths).size !== paths.length)
    throw new SafeError("Choose a different folder for each role.");
  if (
    paths.some(
      (path) =>
        !folders.some(
          (folder) => folder.path === path && !folder.flags.has("\\Noselect"),
        ),
    )
  )
    throw new SafeError("A selected folder is no longer available.");
  return mapping;
}

export function encodeICloudFolderId(path: string): string {
  return `imap:${Buffer.from(path, "utf8").toString("base64url")}`;
}

export function decodeICloudFolderId(id: string): string {
  if (!/^imap:[A-Za-z0-9_-]+$/.test(id))
    throw new SafeError("Invalid iCloud folder.");
  const path = Buffer.from(id.slice(5), "base64url").toString("utf8");
  if (
    !path ||
    [...path].some(
      (char) =>
        char.charCodeAt(0) < 32 ||
        char.charCodeAt(0) === 127 ||
        char === "\ufffd",
    ) ||
    encodeICloudFolderId(path) !== id
  )
    throw new SafeError("Invalid iCloud folder.");
  return path;
}
