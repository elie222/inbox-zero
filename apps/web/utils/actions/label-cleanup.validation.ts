import { z } from "zod";
import { LabelCleanupAction } from "@/generated/prisma/enums";

export const saveLabelCleanupBody = z.object({
  labelId: z.string().min(1),
  labelName: z.string().min(1),
  afterDays: z.number().int().min(1).max(3650),
  action: z.nativeEnum(LabelCleanupAction),
});
export type SaveLabelCleanupBody = z.infer<typeof saveLabelCleanupBody>;

export const deleteLabelCleanupBody = z.object({
  id: z.string().min(1),
});
export type DeleteLabelCleanupBody = z.infer<typeof deleteLabelCleanupBody>;
