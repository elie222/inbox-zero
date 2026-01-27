import { z } from "zod";

export const ALLOWED_SCHEMES = ["inboxzero://"];

export const MOBILE_REDIRECT_COOKIE = "mobile_redirect_uri";

export const mobileAuthQuerySchema = z.object({
  redirect_uri: z
    .string()
    .min(1, "Missing redirect_uri parameter")
    .refine(
      (uri) => ALLOWED_SCHEMES.some((scheme) => uri.startsWith(scheme)),
      "Invalid redirect_uri scheme. Must use inboxzero:// scheme.",
    ),
  provider: z.enum(["google", "microsoft"]).optional(),
});

export type MobileAuthQuery = z.infer<typeof mobileAuthQuerySchema>;
