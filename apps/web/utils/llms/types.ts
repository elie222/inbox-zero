import type { User } from "@prisma/client";

export type UserAIFields = Pick<User, "aiProvider" | "aiModel" | "aiApiKey">;
export type UserEmailWithAI = Pick<User, "id" | "email" | "about"> &
  UserAIFields;
