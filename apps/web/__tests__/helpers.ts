import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";

export function getEmailAccount(): EmailAccountWithAI {
  return {
    id: "email-account-id",
    userId: "user1",
    email: "user@test.com",
    about: null,
    user: {
      aiModel: null,
      aiProvider: null,
      aiApiKey: null,
    },
  };
}

export function getEmail({
  from = "user@test.com",
  subject = "Test Subject",
  content = "Test content",
  replyTo,
  cc,
}: Partial<EmailForLLM> = {}): EmailForLLM {
  return {
    id: "email-id",
    from,
    subject,
    content,
    ...(replyTo && { replyTo }),
    ...(cc && { cc }),
  };
}
