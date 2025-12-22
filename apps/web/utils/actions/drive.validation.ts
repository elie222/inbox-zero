import { z } from "zod";

export const disconnectDriveBody = z.object({
  connectionId: z.string(),
});
export type DisconnectDriveBody = z.infer<typeof disconnectDriveBody>;

export const updateFilingPromptBody = z.object({
  filingPrompt: z.string().optional().nullable(),
});
export type UpdateFilingPromptBody = z.infer<typeof updateFilingPromptBody>;

export const updateFilingEnabledBody = z.object({
  filingEnabled: z.boolean(),
});
export type UpdateFilingEnabledBody = z.infer<typeof updateFilingEnabledBody>;

const filingFolderSchema = z.object({
  folderId: z.string(),
  folderName: z.string(),
  folderPath: z.string(),
  driveConnectionId: z.string(),
});

export const updateFilingFoldersBody = z.object({
  folders: z.array(filingFolderSchema),
});
export type UpdateFilingFoldersBody = z.infer<typeof updateFilingFoldersBody>;

export const addFilingFolderBody = filingFolderSchema;
export type AddFilingFolderBody = z.infer<typeof addFilingFolderBody>;

export const removeFilingFolderBody = z.object({
  folderId: z.string(),
});
export type RemoveFilingFolderBody = z.infer<typeof removeFilingFolderBody>;

export const submitPreviewFeedbackBody = z.object({
  filingId: z.string(),
  feedbackPositive: z.boolean(),
});
export type SubmitPreviewFeedbackBody = z.infer<
  typeof submitPreviewFeedbackBody
>;

export const moveFilingBody = z.object({
  filingId: z.string(),
  targetFolderId: z.string(),
  targetFolderPath: z.string(),
});
export type MoveFilingBody = z.infer<typeof moveFilingBody>;
