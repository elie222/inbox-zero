import { z } from "zod";

export const dismissAnnouncementBody = z.object({
  announcementId: z.string().min(1, "Announcement ID is required"),
});

export type DismissAnnouncementBody = z.infer<typeof dismissAnnouncementBody>;
