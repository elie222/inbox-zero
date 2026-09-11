import type {
  TransactionalEmailMessage,
  TransactionalEmailSendOptions,
  TransactionalEmailProviderResult,
} from "./provider";
import { createResendTransactionalEmailProvider } from "./providers/resend";

const provider = process.env.RESEND_API_KEY
  ? createResendTransactionalEmailProvider(process.env.RESEND_API_KEY)
  : null;

export function isTransactionalEmailConfigured() {
  return provider !== null;
}

export async function deliverTransactionalEmail(
  message: TransactionalEmailMessage,
  options?: TransactionalEmailSendOptions,
): Promise<TransactionalEmailProviderResult | null> {
  if (!provider) return null;

  return provider.send(message, options);
}
