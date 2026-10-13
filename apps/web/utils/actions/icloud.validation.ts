import { z } from "zod";
import { iCloudFoldersSchema } from "@/utils/icloud/folders";
export const connectICloudBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().trim().min(1).max(128),
});
export const updateICloudFoldersBody = iCloudFoldersSchema;
