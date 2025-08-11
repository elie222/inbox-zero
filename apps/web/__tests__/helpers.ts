import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";

export function getEmailAccount(
  overrides: Partial<EmailAccountWithAI> = {},
): EmailAccountWithAI {
  return {
    id: "email-account-id",
    userId: "user1",
    email: overrides.email || "user@test.com",
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
  to = "user2@test.com",
  subject = "Test Subject",
  content = "Test content",
  replyTo,
  cc,
}: Partial<EmailForLLM> = {}): EmailForLLM {
  return {
    id: "email-id",
    from,
    to,
    subject,
    content,
    ...(replyTo && { replyTo }),
    ...(cc && { cc }),
  };
}
