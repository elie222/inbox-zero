import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";
import {
  inspectCommandMatches,
  inspectCommandToMutation,
  type InspectCommand,
} from "@/utils/playwright/mail-inspect-command";

const DEFAULT_SPLIT_RULE_ID = "playwright-default-split-rule";
const DEFAULT_SPLIT_ACTION_ID = "playwright-default-split-action";
const DEFAULT_SPLIT_LABEL_ID = "Label_project";

export async function openMail(page: Page) {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`, {
    waitUntil: "domcontentloaded",
  });

  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations).toBeVisible({ timeout: 60_000 });

  return { conversations, emailAccountId };
}

/**
 * Mailboxes other than the inbox sit behind the collapsed "Mail" group, which
 * stays open once a view inside it is showing.
 */
export async function openMailboxFromSidebar(page: Page, name: string) {
  const link = page.getByRole("link", { name: new RegExp(`^${name}`) });
  if (!(await link.isVisible())) {
    await page.getByRole("button", { name: "Mail", exact: true }).click();
  }
  await link.click();
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

export async function waitForComposeOutboxSend(
  page: Page,
  emailAccountId: string,
) {
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "compose:new-message",
        }),
      { timeout: 20_000 },
    )
    .toMatchObject({ status: "succeeded" });
}

export async function readLatestMailMutation(
  page: Page,
  expected: {
    emailAccountId: string;
    kind: string;
    sender?: string;
    threadId?: string;
    payload?: Record<string, unknown>;
  },
) {
  try {
    const commands = await page.evaluate(async () => {
      const inspect = window.__inboxZeroMailInspect;
      if (!inspect?.read) return;
      const diagnostics = (await inspect.read()) as {
        commands?: InspectCommand[];
      };
      return diagnostics.commands;
    });
    const command = commands
      ?.filter((item) => inspectCommandMatches(item, expected))
      .at(-1);
    if (!command) return;
    return inspectCommandToMutation(command);
  } catch (error) {
    if (String(error).includes("Execution context was destroyed")) return;
    throw error;
  }
}

export async function seedDefaultSplitRule(emailAccountId: string) {
  await withClient(async (client) => {
    await deleteDefaultSplitRule(client, emailAccountId);
    await client.query(
      `INSERT INTO "Rule"
        (id, name, enabled, automate, "runOnThreads", "systemType",
         "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, 'Calendar', true, true, false, 'CALENDAR', $2,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [DEFAULT_SPLIT_RULE_ID, emailAccountId],
    );
    await client.query(
      `INSERT INTO "Action"
        (id, type, "ruleId", "emailAccountId", label, "labelId",
         "createdAt", "updatedAt")
       VALUES ($1, 'LABEL', $2, $3, 'Project Alpha', $4,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        DEFAULT_SPLIT_ACTION_ID,
        DEFAULT_SPLIT_RULE_ID,
        emailAccountId,
        DEFAULT_SPLIT_LABEL_ID,
      ],
    );
  });
}

export async function cleanupDefaultSplitRule(emailAccountId: string) {
  await withClient((client) => deleteDefaultSplitRule(client, emailAccountId));
}

async function deleteDefaultSplitRule(client: Client, emailAccountId: string) {
  await client.query(
    `DELETE FROM "MailSplit"
     WHERE "emailAccountId" = $1
       AND EXISTS (SELECT 1 FROM "MailSplitFilter" f WHERE f."mailSplitId" = "MailSplit".id AND f.kind = 'LABEL' AND f.value = $2)
       AND name = 'Calendar'`,
    [emailAccountId, DEFAULT_SPLIT_LABEL_ID],
  );
  await client.query(
    `DELETE FROM "Rule" WHERE id = $1 AND "emailAccountId" = $2`,
    [DEFAULT_SPLIT_RULE_ID, emailAccountId],
  );
}

export async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

export async function insertInboxMailInConversation(
  page: Page,
  input: {
    threadId: string;
    messageId: string;
    subject: string;
    from: string;
  },
) {
  const token = await readProviderAccessToken();
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  if (!email) throw new Error("PLAYWRIGHT_TEST_EMAIL is missing");
  if (isMicrosoftPlaywright()) {
    await insertOutlookInboxReply(page, token, input);
    return;
  }
  const baseUrl = process.env.GOOGLE_BASE_URL;
  if (!baseUrl) throw new Error("GOOGLE_BASE_URL is missing");
  const inserted = await page.request.post(
    `${baseUrl}/gmail/v1/users/me/messages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      data: {
        threadId: input.threadId,
        from: input.from,
        to: email,
        subject: input.subject,
        body_text: "New mail in the archived conversation.",
        labelIds: ["INBOX", "UNREAD"],
        internalDate: String(Date.now()),
      },
    },
  );
  expect(inserted.ok(), await inserted.text()).toBe(true);
}

async function insertOutlookInboxReply(
  page: Page,
  token: string,
  input: { messageId: string; subject: string },
) {
  const baseUrl = process.env.MICROSOFT_BASE_URL;
  if (!baseUrl) throw new Error("MICROSOFT_BASE_URL is missing");
  const headers = {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const draft = await page.request.post(
    `${baseUrl}/v1.0/me/messages/${input.messageId}/createReply`,
    { headers },
  );
  expect(draft.ok(), await draft.text()).toBe(true);
  const draftId = ((await draft.json()) as { id?: string }).id;
  if (!draftId) throw new Error("Outlook createReply did not return an id");
  const patched = await page.request.patch(
    `${baseUrl}/v1.0/me/messages/${draftId}`,
    {
      headers,
      data: {
        subject: input.subject,
        body: {
          contentType: "text",
          content: "New mail in the archived conversation.",
        },
        isRead: false,
      },
    },
  );
  expect(patched.ok(), await patched.text()).toBe(true);
  const moved = await page.request.post(
    `${baseUrl}/v1.0/me/messages/${draftId}/move`,
    {
      headers,
      data: { destinationId: "inbox" },
    },
  );
  expect(moved.ok(), await moved.text()).toBe(true);
}

async function readProviderAccessToken() {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  if (!email) throw new Error("PLAYWRIGHT_TEST_EMAIL is missing");
  const token = await withClient(async (client) => {
    const result = await client.query<{ access_token: string | null }>(
      `SELECT account.access_token
       FROM "EmailAccount" email_account
       JOIN "Account" account ON account.id = email_account."accountId"
       WHERE email_account.email = $1`,
      [email],
    );
    return result.rows[0]?.access_token ?? null;
  });
  if (!token) throw new Error("Could not read the Playwright provider token");
  return token;
}
