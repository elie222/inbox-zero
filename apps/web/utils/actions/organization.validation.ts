import { z } from "zod";

export const createOrganizationBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(100, "Organization name must be less than 100 characters"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(50, "Slug must be less than 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    ),
});
export type CreateOrganizationBody = z.infer<typeof createOrganizationBody>;
