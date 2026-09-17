import { z } from "zod";

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
