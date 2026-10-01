import { z } from "zod";
import { PremiumTier } from "@/generated/prisma/enums";

export const activateLicenseKeySchema = z.object({
  licenseKey: z.string(),
});
export type ActivateLicenseKeyOptions = z.infer<
  typeof activateLicenseKeySchema
>;

// Where Stripe sends the user after a successful checkout. Defaults to the
// setup page; the paywall-first onboarding experiment sends users back into
// onboarding once they've paid.
export const CHECKOUT_RETURN_TO_PARAM = "returnTo";
export const checkoutReturnToSchema = z.enum(["onboarding"]);
export type CheckoutReturnTo = z.infer<typeof checkoutReturnToSchema>;

export const changePremiumStatusSchema = z.object({
  email: z.string().email(),
  emailAccountsAccess: z.number().optional(),
  period: z.nativeEnum(PremiumTier),
  count: z.number().optional(),
  upgrade: z.boolean(),
});
export type ChangePremiumStatusOptions = z.infer<
  typeof changePremiumStatusSchema
>;
