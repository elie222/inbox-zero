import { z } from "zod";

export const updateAllAccountsSelectionBody = z.object({
  emailAccountIds: z.array(z.string()).min(1),
});

export const reorderEmailAccountsBody = z.object({
  emailAccountIds: z
    .array(z.string().min(1))
    .min(1)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Email account IDs must be unique",
    ),
});
