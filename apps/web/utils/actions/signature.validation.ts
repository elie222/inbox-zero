import { z } from "zod";

export const createSignatureBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  html: z.string().trim().min(1, "Signature is required").max(10_000),
});
export type CreateSignatureBody = z.infer<typeof createSignatureBody>;

export const updateSignatureBody = createSignatureBody.extend({
  id: z.string().min(1),
});
export type UpdateSignatureBody = z.infer<typeof updateSignatureBody>;

export const deleteSignatureBody = z.object({
  id: z.string().min(1),
});
