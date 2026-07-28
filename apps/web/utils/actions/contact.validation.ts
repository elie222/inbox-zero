import { z } from "zod";
import {
  ContactInboxPriority,
  GoogleContactsSyncMode,
} from "@/generated/prisma/enums";

// Absolute URLs, or an app-relative logo-proxy path (what the company
// logo picker stores), or empty to clear
const urlOrEmpty = z
  .string()
  .url()
  .max(2000)
  .or(
    z
      .string()
      .regex(/^\/api\/public\/logo\?domain=[^\s]+$/)
      .max(2000),
  )
  .or(z.literal(""));

// One labeled number ("Mobile", "Office", …); a contact can hold several
export const contactPhoneEntry = z.object({
  label: z.string().max(50),
  value: z.string().min(1).max(100),
});

// A contact is addressed by email, or by contactId when it has none —
// Google and iOS both allow phone-only contacts
export const updateContactBody = z.object({
  contactId: z.string().nullish(),
  email: z.string().email().nullish(),
  name: z.string().max(200).nullish(),
  title: z.string().max(200).nullish(),
  // undefined leaves phones untouched; [] clears them
  phones: z.array(contactPhoneEntry).max(10).optional(),
  notes: z.string().max(10_000).nullish(),
  photoUrl: urlOrEmpty.nullish(),
  useCompanyLogo: z.boolean().optional(),
  isPersonal: z.boolean().optional(),
  // "" clears the company; a name finds-or-creates one and adopts the
  // contact's email domain
  companyName: z.string().max(200).nullish(),
});
export type UpdateContactBody = z.infer<typeof updateContactBody>;

export const enrichContactBody = z.object({
  email: z.string().email(),
});

// A photo of a paper business card, as a base64 data URL. Capped well under
// the model's limits — phone cameras produce multi-megabyte JPEGs and the
// client downscales before sending.
export const scanBusinessCardBody = z.object({
  imageDataUrl: z
    .string()
    .max(8_000_000)
    .refine(
      (value) => /^data:image\/(jpeg|png|webp|heic|heif);base64,/.test(value),
      "Upload a photo of the card (JPEG, PNG, WebP, or HEIC)",
    ),
});
export type ScanBusinessCardBody = z.infer<typeof scanBusinessCardBody>;
export type EnrichContactBody = z.infer<typeof enrichContactBody>;

// The opened email whose body should be scanned for people to add
export const extractContactsBody = z.object({
  from: z.string().max(500),
  subject: z.string().max(500),
  content: z.string().min(1).max(20_000),
});
export type ExtractContactsBody = z.infer<typeof extractContactsBody>;

// Looser than .email() on purpose: rows created by CardDAV/Google sync can
// hold addresses that fail the strict regex, and delete is an exact-match
// lookup scoped to the account — format doesn't matter
export const deleteContactBody = z.object({
  contactId: z.string().nullish(),
  email: z.string().trim().min(1).max(320).nullish(),
});
export type DeleteContactBody = z.infer<typeof deleteContactBody>;

export const setGoogleContactsSyncBody = z.object({
  // OFF | PULL (one-way import) | TWO_WAY (import + push local edits back)
  mode: z.nativeEnum(GoogleContactsSyncMode),
});
export type SetGoogleContactsSyncBody = z.infer<
  typeof setGoogleContactsSyncBody
>;

export const setCarddavAccessBody = z.object({
  enabled: z.boolean(),
});
export type SetCarddavAccessBody = z.infer<typeof setCarddavAccessBody>;

export const createCompanyBody = z.object({
  name: z.string().min(1).max(200),
  domains: z.array(z.string().min(1).max(200)).max(50).optional(),
});
export type CreateCompanyBody = z.infer<typeof createCompanyBody>;

export const setDomainIgnoredBody = z.object({
  domain: z.string().min(1).max(200),
  ignored: z.boolean(),
});
export type SetDomainIgnoredBody = z.infer<typeof setDomainIgnoredBody>;

export const setContactInboxPriorityBody = z
  .object({
    email: z.string().trim().min(1).max(320),
    // OFF (follow rules) | ALWAYS (skip rules, stay in inbox) | AI
    // (instructions decide per email)
    priority: z.nativeEnum(ContactInboxPriority),
    instructions: z.string().max(2000).nullish(),
  })
  .refine(
    (data) =>
      data.priority !== ContactInboxPriority.AI || !!data.instructions?.trim(),
    {
      message: "Add instructions so the AI knows what should stay in the inbox",
      path: ["instructions"],
    },
  );
export type SetContactInboxPriorityBody = z.infer<
  typeof setContactInboxPriorityBody
>;

export const setContactIgnoredBody = z.object({
  email: z.string().trim().min(1).max(320),
  ignored: z.boolean(),
});
export type SetContactIgnoredBody = z.infer<typeof setContactIgnoredBody>;

export const updateCompanyBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  domains: z.array(z.string().min(1).max(200)).max(50).optional(),
  logoUrl: urlOrEmpty.nullish(),
  logoWhiteBackground: z.boolean().optional(),
  // "" clears the label; a name finds-or-creates one, optionally nested
  // under a parent label ("Factory" > Toyota)
  labelName: z.string().max(100).nullish(),
  labelParentName: z.string().max(100).nullish(),
});
export type UpdateCompanyBody = z.infer<typeof updateCompanyBody>;

export const updateCompanyLabelBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  // null moves the label to the top level; undefined leaves nesting alone
  parentId: z.string().min(1).nullish(),
});
export type UpdateCompanyLabelBody = z.infer<typeof updateCompanyLabelBody>;

export const deleteCompanyLabelBody = z.object({
  id: z.string().min(1),
});
export type DeleteCompanyLabelBody = z.infer<typeof deleteCompanyLabelBody>;

export const researchCompanyBody = z.object({
  id: z.string().min(1),
});
export type ResearchCompanyBody = z.infer<typeof researchCompanyBody>;

export const deleteCompanyBody = z.object({
  id: z.string().min(1),
});
export type DeleteCompanyBody = z.infer<typeof deleteCompanyBody>;

export const mergeCompaniesBody = z.object({
  // The source is absorbed into the target and deleted
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});
export type MergeCompaniesBody = z.infer<typeof mergeCompaniesBody>;
