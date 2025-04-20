import type { EmailForLLM } from "@/utils/types";

export function getUser() {
  return {
    userId: "user1",
    email: "user@test.com",
    aiModel: null,
    aiProvider: null,
    aiApiKey: null,
    about: null,
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
