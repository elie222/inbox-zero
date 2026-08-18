import type { Page } from "@playwright/test";

const ACCOUNT_LOOKUP_TIMEOUT_MS = 60_000;
const ACCOUNT_LOOKUP_RETRY_MS = 1000;

type EmailAccount = {
  email: string;
  id: string;
};

type AccountLookupOptions = {
  timeout?: number;
};

export async function getEmailAccount(
  page: Page,
  { timeout = ACCOUNT_LOOKUP_TIMEOUT_MS }: AccountLookupOptions = {},
) {
  let lastError: unknown;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const response = await page.request.get("/api/user/email-accounts");
      if (response.ok()) {
        const { emailAccounts } = (await response.json()) as {
          emailAccounts: EmailAccount[];
        };
        const emailAccount = emailAccounts[0];
        if (emailAccount) return emailAccount;
        lastError = new Error("The setup project created no account");
      } else {
        lastError = new Error(
          `Email accounts request failed with ${response.status()}`,
        );
      }
    } catch (error) {
      lastError = error;
    }

    await page.waitForTimeout(ACCOUNT_LOOKUP_RETRY_MS);
  }

  throw new Error(
    `Could not read the setup email account: ${getErrorMessage(lastError)}`,
  );
}

export async function getEmailAccountId(
  page: Page,
  options?: AccountLookupOptions,
) {
  const emailAccount = await getEmailAccount(page, options);
  return emailAccount.id;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
