import { z } from "zod";

export const digestPreviewBody = z.object({
  categories: z.string().transform((val) => {
    if (!val) return [];
    try {
      // Try to parse as JSON array first
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Fall back to comma-separated string
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }),
});

export type DigestPreviewBody = z.infer<typeof digestPreviewBody>;
