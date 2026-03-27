import { z } from "zod";
import { DraftMaterializationMode } from "@/generated/prisma/enums";

export const saveDraftReviewSettingsBody = z.object({
  enabled: z.boolean(),
  messagingChannelId: z.string().cuid().nullable(),
  draftMaterializationMode: z.nativeEnum(DraftMaterializationMode),
});

export type SaveDraftReviewSettingsBody = z.infer<
  typeof saveDraftReviewSettingsBody
>;
