import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullish();

// People type "www.dcd.auto", not "https://www.dcd.auto" — add the scheme
// rather than rejecting what they wrote
const urlWithOptionalScheme = z
  .string()
  .trim()
  .max(2000)
  .transform((value) =>
    value && !/^https?:\/\//i.test(value) ? `https://${value}` : value,
  )
  .refine((value) => {
    if (!value) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid web address");

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
  website: urlWithOptionalScheme.nullish(),
  photoUrl: urlWithOptionalScheme.nullish(),
  location: optionalText(120),
  linkedinUrl: urlWithOptionalScheme.nullish(),
  xUrl: urlWithOptionalScheme.nullish(),
  instagramUrl: urlWithOptionalScheme.nullish(),
});
export type UpsertContactCardBody = z.infer<typeof upsertContactCardBody>;

// Emails the sender's own card link to someone whose card was just scanned
export const sendMyCardBody = z.object({
  to: z.string().trim().email(),
  recipientName: optionalText(200),
});
export type SendMyCardBody = z.infer<typeof sendMyCardBody>;

// What a visitor types into the card's Exchange form. Unauthenticated input,
// so every field is length-capped before it reaches the database.
export const contactCardExchangeBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: optionalText(50),
  companyTitle: optionalText(200),
  note: optionalText(2000),
});
export type ContactCardExchangeBody = z.infer<typeof contactCardExchangeBody>;

// The card owner accepting or dismissing one of those submissions
export const resolveContactCardExchangeBody = z.object({
  exchangeId: z.string().min(1),
  accept: z.boolean(),
});
export type ResolveContactCardExchangeBody = z.infer<
  typeof resolveContactCardExchangeBody
>;
