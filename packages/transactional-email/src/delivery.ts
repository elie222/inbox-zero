import type {
  TransactionalEmailMessage,
  TransactionalEmailSendOptions,
  TransactionalEmailProviderResult,
} from "./provider";
import { createResendTransactionalEmailProvider } from "./providers/resend";
import { createSesTransactionalEmailProvider } from "./providers/ses";

const provider = createTransactionalEmailProvider();

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

function createTransactionalEmailProvider() {
  if (process.env.TRANSACTIONAL_EMAIL_PROVIDER === "ses") {
    return createSesTransactionalEmailProvider();
  }

  if (process.env.RESEND_API_KEY) {
    return createResendTransactionalEmailProvider(process.env.RESEND_API_KEY);
  }

  return null;
}
