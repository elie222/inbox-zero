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

export const inviteMemberBody = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address")
    .transform((val) => val.trim().toLowerCase()),
  role: z.enum(["owner", "admin", "member"]),
  organizationId: z.string().min(1, "Organization ID is required"),
});
export type InviteMemberBody = z.infer<typeof inviteMemberBody>;

export const handleInvitationBody = z.object({
  invitationId: z.string().trim().min(1, "Invitation ID is required"),
});
export type HandleInvitationBody = z.infer<typeof handleInvitationBody>;

export const removeMemberBody = z.object({
  memberId: z.string().min(1, "Member ID is required"),
});

export type RemoveMemberBody = z.infer<typeof removeMemberBody>;

export const cancelInvitationBody = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
});

export type CancelInvitationBody = z.infer<typeof cancelInvitationBody>;
