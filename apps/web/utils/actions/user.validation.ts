import { z } from "zod";

export const saveAboutBody = z.object({ about: z.string().max(2000) });
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export const saveSignatureBody = z.object({
  signature: z.string().max(10_000),
});
export type SaveSignatureBody = z.infer<typeof saveSignatureBody>;

export const saveWritingStyleBody = z.object({
  writingStyle: z.string().max(2000),
});
export type SaveWritingStyleBody = z.infer<typeof saveWritingStyleBody>;
