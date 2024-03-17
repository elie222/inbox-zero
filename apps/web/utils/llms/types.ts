import { User } from "@prisma/client";

export type UserAIFields = Pick<
  User,
  "aiProvider" | "aiModel" | "openAIApiKey"
>;
