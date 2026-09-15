import { z } from "zod";

export const createScimConnectionBody = z.object({
  providerId: z.string().min(1),
  creationRequestId: z.string().uuid(),
  expiresAt: z.coerce.date().refine((date) => date > new Date(), {
    message: "Credential expiry must be in the future",
  }),
});

export const revokeScimCredentialBody = z.object({
  providerId: z.string().min(1),
  connectionId: z.string().min(1),
  credentialId: z.string().min(1),
});
