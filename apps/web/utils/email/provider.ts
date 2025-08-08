import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import type { EmailProvider } from "@/utils/email/types";

export async function createEmailProvider({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: string | null;
}): Promise<EmailProvider> {
  if (provider === "google") {
    const client = await getGmailClientForEmail({ emailAccountId });
    return new GmailProvider(client);
  } else if (provider === "microsoft-entra-id") {
    const client = await getOutlookClientForEmail({ emailAccountId });
    return new OutlookProvider(client);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}
