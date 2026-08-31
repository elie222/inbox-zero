import { z } from "zod";

export const updateAllAccountsSelectionBody = z.object({
  emailAccountIds: z.array(z.string()).min(1),
});
