import { z } from "zod";
import { GoogleContactsSyncMode } from "@/generated/prisma/enums";

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

export const updateContactBody = z.object({
  email: z.string().email(),
  name: z.string().max(200).nullish(),
  title: z.string().max(200).nullish(),
  phone: z.string().max(100).nullish(),
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
export type EnrichContactBody = z.infer<typeof enrichContactBody>;

// Looser than .email() on purpose: rows created by CardDAV/Google sync can
// hold addresses that fail the strict regex, and delete is an exact-match
// lookup scoped to the account — format doesn't matter
export const deleteContactBody = z.object({
  email: z.string().trim().min(1).max(320),
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
