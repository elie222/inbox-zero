import type { EmailAccount } from "@prisma/client";

export type UserAIFields = Pick<
  EmailAccount,
  "aiProvider" | "aiModel" | "aiApiKey"
>;
export type UserEmailWithAI = Pick<EmailAccount, "userId" | "email" | "about"> &
  UserAIFields;
