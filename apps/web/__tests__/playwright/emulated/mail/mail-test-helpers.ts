import { expect, type Locator, type Page } from "@playwright/test";

export async function openMail(page: Page) {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`);

  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations).toBeVisible({ timeout: 60_000 });

  return { conversations, emailAccountId };
}

export function conversationWithSubject(
  page: Page,
  conversations: Locator,
  subject: string,
) {
  return conversations
    .getByRole("option")
    .filter({ has: page.getByText(subject, { exact: true }) });
}

async function getEmailAccountId(page: Page) {
  const response = await page.request.get("/api/user/email-accounts");
  expect(response.ok()).toBeTruthy();
  const { emailAccounts } = (await response.json()) as {
    emailAccounts: { id: string }[];
  };
  const emailAccountId = emailAccounts[0]?.id;
  if (!emailAccountId) throw new Error("The setup project created no account");
  return emailAccountId;
}
