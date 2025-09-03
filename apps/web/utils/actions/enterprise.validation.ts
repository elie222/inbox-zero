import { z } from "zod";

export const ssoRegistrationBody = z.object({
  organizationName: z.string().min(1, "Organization name is required"),
  providerId: z.string().min(1, "Provider ID is required"),
  domain: z.string().min(1, "Domain is required"),
  idpMetadata: z.string().min(1, "IDP metadata is required"),
});
export type SsoRegistrationBody = z.infer<typeof ssoRegistrationBody>;
