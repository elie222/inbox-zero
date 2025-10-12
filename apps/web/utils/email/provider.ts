import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { EmailProvider } from "@/utils/email/types";

export async function createEmailProvider({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: string;
}): Promise<EmailProvider> {
  if (isGoogleProvider(provider)) {
    const client = await getGmailClientForEmail({ emailAccountId });
    return new GmailProvider(client);
  } else if (isMicrosoftProvider(provider)) {
    const client = await getOutlookClientForEmail({ emailAccountId });
    return new OutlookProvider(client);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
