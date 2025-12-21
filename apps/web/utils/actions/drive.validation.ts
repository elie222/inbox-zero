import { z } from "zod";

export const disconnectDriveBody = z.object({
  connectionId: z.string(),
});
export type DisconnectDriveBody = z.infer<typeof disconnectDriveBody>;

export const updateFilingPreferencesBody = z.object({
  filingEnabled: z.boolean(),
  filingPrompt: z.string().optional().nullable(),
});
export type UpdateFilingPreferencesBody = z.infer<
  typeof updateFilingPreferencesBody
>;

export const addFilingFolderBody = z.object({
  folderId: z.string(),
  folderName: z.string(),
  folderPath: z.string(),
  driveConnectionId: z.string(),
});
export type AddFilingFolderBody = z.infer<typeof addFilingFolderBody>;

export const removeFilingFolderBody = z.object({
  id: z.string(),
});
export type RemoveFilingFolderBody = z.infer<typeof removeFilingFolderBody>;
