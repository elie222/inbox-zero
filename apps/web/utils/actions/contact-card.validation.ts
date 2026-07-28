import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const upsertContactCardBody = z.object({
  // Lowercase, hyphenated; the action normalizes before saving so a typed
  // "Chris Dagesse" still lands on a usable public URL
  slug: z.string().trim().min(3).max(64),
  isActive: z.boolean().optional().default(true),
  displayName: z.string().trim().min(1).max(200),
  headline: optionalText(280),
  title: optionalText(200),
  companyName: optionalText(200),
  email: z.union([z.string().trim().email(), z.literal("")]).nullish(),
  phone: optionalText(50),
  website: z.union([z.string().trim().url(), z.literal("")]).nullish(),
  photoUrl: z.union([z.string().trim().url(), z.literal("")]).nullish(),
});
export type UpsertContactCardBody = z.infer<typeof upsertContactCardBody>;

// Emails the sender's own card link to someone whose card was just scanned
export const sendMyCardBody = z.object({
  to: z.string().trim().email(),
  recipientName: optionalText(200),
});
export type SendMyCardBody = z.infer<typeof sendMyCardBody>;
