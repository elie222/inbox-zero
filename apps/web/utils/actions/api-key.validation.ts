import { z } from "zod";

export const createApiKeyBody = z.object({ name: z.string().nullish() });
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;

export const deactivateApiKeyBody = z.object({ id: z.string() });
export type DeactivateApiKeyBody = z.infer<typeof deactivateApiKeyBody>;
