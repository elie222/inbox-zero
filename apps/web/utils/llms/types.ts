import type { Prisma } from "@/generated/prisma/client";

export type UserAIFields = Prisma.UserGetPayload<{
  select: {
    aiProvider: true;
    aiModel: true;
    aiApiKey: true;
  };
}>;
export type EmailAccountWithAI = Prisma.EmailAccountGetPayload<{
  select: {
    id: true;
    userId: true;
    email: true;
    about: true;
    multiRuleSelectionEnabled: true;
    timezone: true;
    calendarBookingLink: true;
    user: {
      select: {
        aiProvider: true;
        aiModel: true;
        aiApiKey: true;
      };
    };
    account: {
      select: {
        provider: true;
      };
    };
  };
}>;
