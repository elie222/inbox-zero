import { z } from "zod";

export const activateLicenseKeySchema = z.object({
  licenseKey: z.string(),
});
export type ActivateLicenseKeyOptions = z.infer<
  typeof activateLicenseKeySchema
>;
