import type { User } from "@/generated/prisma";

export type UserAIFields = Pick<User, "aiProvider" | "aiModel" | "aiApiKey">;
export type UserEmailWithAI = Pick<User, "id" | "email" | "about"> &
  UserAIFields;
