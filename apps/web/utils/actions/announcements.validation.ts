import { z } from "zod";

export const announcementDismissedBody = z.object({
  publishedAt: z.string().datetime(),
});
export type AnnouncementDismissedBody = z.infer<
  typeof announcementDismissedBody
>;
