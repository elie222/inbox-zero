import { z } from "zod";

export const saveMultiAccountPremiumBody = z.object({
  emailAddresses: z
    .array(
      z.object({
        email: z.string(),
      }),
    )
    .optional(),
});
export type SaveMultiAccountPremiumBody = z.infer<
  typeof saveMultiAccountPremiumBody
>;
