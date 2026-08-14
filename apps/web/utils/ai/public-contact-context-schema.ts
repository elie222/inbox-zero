import { z } from "zod";
import { scanSensitiveContent } from "@/utils/dlp/sensitive-content";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";

const publicSourceSchema = z.strictObject({
  url: z
    .string()
    .url()
    .describe("A public HTTP or HTTPS page supporting the researched facts"),
});

const publicCompanyContextSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("The sender's current company name"),
  domain: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .describe("The company's public internet domain without a URL path"),
  website: z
    .string()
    .url()
    .nullable()
    .describe("The company's public HTTP or HTTPS website, or null"),
  description: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .nullable()
    .describe("A sourced description of what the company does, or null"),
  industry: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .nullable()
    .describe("The company's publicly stated industry, or null"),
  employeeCount: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .nullable()
    .describe(
      "A sourced employee count or range, including qualifiers, or null",
    ),
  funding: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .describe("Publicly announced funding with any needed qualifier, or null"),
});

export const publicContactContextSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("The professional's public name"),
  role: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .nullable()
    .describe("The professional's current public role, or null"),
  company: publicCompanyContextSchema
    .nullable()
    .describe("The sender's current company, or null when not established"),
  sources: z
    .array(publicSourceSchema)
    .min(1)
    .max(5)
    .describe("One to five public pages that support the returned facts"),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("Confidence that the public profile matches the email sender"),
});

export type PublicContactContext = z.infer<typeof publicContactContextSchema>;

export function isSafeForSharedCache(context: PublicContactContext): boolean {
  const publicText = [
    context.name,
    context.role,
    context.company?.name,
    context.company?.domain,
    context.company?.description,
    context.company?.industry,
    context.company?.employeeCount,
    context.company?.funding,
  ].filter((value): value is string => Boolean(value));

  const publicUrls = [
    context.company?.website,
    ...context.sources.map((source) => source.url),
  ].filter((value): value is string => Boolean(value));

  return (
    ![...publicText, ...publicUrls].some((value) =>
      containsEmailAddress(value),
    ) &&
    publicText.every((value) => scanSensitiveContent(value).length === 0) &&
    publicUrls.every(isSafeExternalHttpUrl)
  );
}

function containsEmailAddress(value: string) {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value);
}
