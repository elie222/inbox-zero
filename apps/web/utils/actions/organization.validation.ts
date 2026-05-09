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

export const MAX_BULK_INVITES = 10;

export const inviteMembersBody = z.object({
  invitations: z
    .array(
      z.object({
        email: z
          .string()
          .trim()
          .email("Please enter a valid email address")
          .transform((val) => val.trim().toLowerCase()),
        role: z.enum(["owner", "admin", "member"]),
      }),
    )
    .min(1, "At least one invitation is required")
    .max(
      MAX_BULK_INVITES,
      `You can invite up to ${MAX_BULK_INVITES} people at a time`,
    ),
  organizationId: z.string().min(1, "Organization ID is required"),
});
export type InviteMembersBody = z.infer<typeof inviteMembersBody>;

export const handleInvitationBody = z.object({
  invitationId: z.string().trim().min(1, "Invitation ID is required"),
});
export type HandleInvitationBody = z.infer<typeof handleInvitationBody>;

export const removeMemberBody = z.object({
  memberId: z.string().min(1, "Member ID is required"),
});

export type RemoveMemberBody = z.infer<typeof removeMemberBody>;

export const updateMemberRoleBody = z.object({
  memberId: z.string().min(1, "Member ID is required"),
  role: z.enum(["admin", "member"]),
});

export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleBody>;

export const cancelInvitationBody = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
});

export type CancelInvitationBody = z.infer<typeof cancelInvitationBody>;

export const updateAnalyticsConsentBody = z.object({
  allowOrgAdminAnalytics: z.boolean(),
});

export type UpdateAnalyticsConsentBody = z.infer<
  typeof updateAnalyticsConsentBody
>;

export const createOrganizationAndInviteBody = z.object({
  emails: z
    .array(
      z
        .string()
        .trim()
        .email()
        .transform((val) => val.toLowerCase()),
    )
    .min(1, "At least one email is required"),
  userName: z.string().nullable().optional(),
});
export type CreateOrganizationAndInviteBody = z.infer<
  typeof createOrganizationAndInviteBody
>;
