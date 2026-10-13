import { expect, type Page } from "@playwright/test";
import { isMicrosoftPlaywright } from "../mail-provider";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  openMail,
  readProviderAccessToken,
  requestMailSync,
  UNDO_WINDOW_SEND_TIMEOUT_MS,
} from "./mail-test-helpers";

test.skip(
  isMicrosoftPlaywright(),
  "Outlook mail always goes out from the account address.",
);

const ALIAS = {
  email: "support@example.com",
  name: "Playwright Support",
  signature: "<div>The Playwright Support Team</div>",
};
const ALIAS_SIGNATURE_TEXT = "The Playwright Support Team";

test.beforeEach(async ({ page }) => {
  await gmail(page, "POST", "settings/sendAs", {
    sendAsEmail: ALIAS.email,
    displayName: ALIAS.name,
    signature: ALIAS.signature,
  });
});

test.afterEach(async ({ page }) => {
  await gmail(
    page,
    "DELETE",
    `settings/sendAs/${encodeURIComponent(ALIAS.email)}`,
  );
});

test("replies from the alias a message was sent to", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const subject = `Alias support request ${testInfo.retry}`;
  const threadId = await insertMailToAlias(page, subject);
  await requestMailSync(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=${threadId}`);

  const reply = page.getByRole("button", { name: "Reply", exact: true });
  await expect(reply.first()).toBeVisible({ timeout: 60_000 });
  await reply.first().click();

  const summary = page.getByRole("button", { name: /^Draft to/ });
  await expect(summary).toContainText(`from ${ALIAS.email}`);
  await capturePlaywrightCheckpoint(page, testInfo, "reply-summary-from-alias");

  await summary.click();
  const from = page.getByRole("combobox", { name: "From" });
  await expect(from).toContainText(ALIAS.email);
  const editor = page.getByRole("textbox", { name: "Email message" });
  await page.getByRole("button", { name: /^Show signature/ }).click();
  await expect(
    editor.locator("[data-smartmail]").getByText(ALIAS_SIGNATURE_TEXT),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "reply-from-alias");

  await editor.click();
  await editor.press("ControlOrMeta+Home");
  await editor.pressSequentially("Thanks for reaching out.");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect
    .poll(() => readSentFrom(page, threadId), {
      timeout: UNDO_WINDOW_SEND_TIMEOUT_MS,
    })
    .toContain(ALIAS.email);
});

test("switching the sender swaps the signature and sends from it", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const subject = `Alias switch request ${testInfo.retry}`;
  const threadId = await insertMailToAlias(page, subject);
  await requestMailSync(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=${threadId}`);

  const reply = page.getByRole("button", { name: "Reply", exact: true });
  await expect(reply.first()).toBeVisible({ timeout: 60_000 });
  await reply.first().click();
  await page.getByRole("button", { name: /^Draft to/ }).click();

  const editor = page.getByRole("textbox", { name: "Email message" });
  await editor.pressSequentially("Written before switching.");
  await page.getByRole("button", { name: /^Show signature/ }).click();
  const signature = editor.locator("[data-smartmail]");
  await expect(signature.getByText(ALIAS_SIGNATURE_TEXT)).toBeVisible();

  const accountEmail = process.env.PLAYWRIGHT_TEST_EMAIL ?? "";
  await page.getByRole("combobox", { name: "From" }).click();
  await page.getByRole("option", { name: accountEmail }).click();

  await expect(page.getByRole("combobox", { name: "From" })).toContainText(
    accountEmail,
  );
  await expect(editor.getByText(ALIAS_SIGNATURE_TEXT)).toHaveCount(0);
  await expect(editor).toContainText("Written before switching.");
  await capturePlaywrightCheckpoint(page, testInfo, "switched-to-default");

  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() => readSentFrom(page, threadId), {
      timeout: UNDO_WINDOW_SEND_TIMEOUT_MS,
    })
    .toContain(accountEmail);
});

test("composes a new message from an alias", async ({ page }, testInfo) => {
  await openMail(page);
  const subject = `Composed from alias ${testInfo.retry}`;

  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog.getByRole("combobox", { name: "From" }).click();
  await page
    .getByRole("option", { name: `${ALIAS.name} (${ALIAS.email})` })
    .click();
  await expect(dialog.getByRole("combobox", { name: "From" })).toContainText(
    ALIAS.email,
  );

  await dialog
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("Subject").fill(subject);
  const editor = dialog.getByRole("textbox", { name: "Email message" });
  await editor.pressSequentially("Sent from the support alias.");
  await dialog.getByRole("button", { name: "Show signature" }).click();
  await expect(
    editor.locator("[data-smartmail]").getByText(ALIAS_SIGNATURE_TEXT),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "compose-from-alias");
  await dialog.getByRole("button", { exact: true, name: "Send" }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => readSentFromSubject(page, subject), {
      timeout: UNDO_WINDOW_SEND_TIMEOUT_MS,
    })
    .toContain(ALIAS.email);
});

async function gmail(
  page: Page,
  method: "GET" | "POST" | "DELETE",
  path: string,
  data?: unknown,
) {
  const token = await readProviderAccessToken();
  const response = await page.request.fetch(
    `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      data,
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
  return response.status() === 204 ? null : response.json();
}

async function insertMailToAlias(page: Page, subject: string) {
  const message = (await gmail(page, "POST", "messages", {
    from: "Erin Example <erin@example.com>",
    to: `${ALIAS.name} <${ALIAS.email}>`,
    subject,
    body_text: "Could you help me with my account?",
    labelIds: ["INBOX", "UNREAD"],
    internalDate: String(Date.now()),
  })) as { threadId: string };
  return message.threadId;
}

async function readSentFrom(page: Page, threadId: string) {
  const thread = (await gmail(page, "GET", `threads/${threadId}`)) as {
    messages: GmailMessage[];
  };
  return sentFromHeader(thread.messages);
}

async function readSentFromSubject(page: Page, subject: string) {
  const list = (await gmail(page, "GET", "messages?labelIds=SENT")) as {
    messages?: { id: string }[];
  };
  const messages = (await Promise.all(
    (list.messages ?? []).map((message) =>
      gmail(page, "GET", `messages/${message.id}`),
    ),
  )) as GmailMessage[];
  return sentFromHeader(
    messages.filter((message) => readHeader(message, "subject") === subject),
  );
}

type GmailMessage = {
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
};

function sentFromHeader(messages: GmailMessage[]) {
  const sent = messages.filter((message) => message.labelIds?.includes("SENT"));
  const latest = sent.at(-1);
  return latest ? readHeader(latest, "from") : "";
}

function readHeader(message: GmailMessage, name: string) {
  return (
    message.payload?.headers?.find(
      (header) => header.name.toLowerCase() === name,
    )?.value ?? ""
  );
}
