import { z } from "zod";
import { apiKeyExpirySchema, apiKeyScopeSchema } from "@/utils/api-key-scopes";

export const createApiKeyBody = z.object({
  name: z.string().trim().max(100).nullish(),
  scopes: z
    .array(apiKeyScopeSchema)
    .min(1, "Select at least one permission")
    .transform((scopes) => [...new Set(scopes)]),
  expiresIn: apiKeyExpirySchema,
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;

export const deactivateApiKeyBody = z.object({ id: z.string() });
export type DeactivateApiKeyBody = z.infer<typeof deactivateApiKeyBody>;
