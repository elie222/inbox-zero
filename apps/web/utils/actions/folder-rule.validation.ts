import { z } from "zod";

export const generateFolderInstructionsBody = z.object({
  labelId: z.string().min(1),
  labelName: z.string().min(1),
});
export type GenerateFolderInstructionsBody = z.infer<
  typeof generateFolderInstructionsBody
>;

// Name of the companion rule that marks a subset of a folder's mail as
// read. Rule names are unique per account, so this doubles as its key.
export function autoReadRuleName(labelName: string) {
  return `Mark read: ${labelName}`;
}

// How much of a folder's incoming mail is marked read automatically:
// nothing, everything filed there, only the listed senders/domains, or
// everything except them.
export const folderAutoReadMode = z.enum(["off", "all", "only", "except"]);
export type FolderAutoReadMode = z.infer<typeof folderAutoReadMode>;

export const setFolderAutoReadBody = z
  .object({
    labelId: z.string().min(1),
    labelName: z.string().min(1),
    mode: folderAutoReadMode,
    // Comma-separated senders ("someone@acme.com") or domains ("@acme.com")
    senders: z.string().max(2000).nullish(),
  })
  .refine((body) => body.mode !== "only" || !!body.senders?.trim(), {
    message: "List at least one sender or domain",
    path: ["senders"],
  })
  .refine((body) => body.mode !== "except" || !!body.senders?.trim(), {
    message: "List at least one sender or domain to exclude",
    path: ["senders"],
  });
export type SetFolderAutoReadBody = z.infer<typeof setFolderAutoReadBody>;
