import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { Client } from "pg";

const commandModifier = process.platform === "darwin" ? "Meta" : "Control";
const SEEDED_THREAD_IDS = [
  "thr_playwright_1",
  "thr_playwright_2",
  "thr_playwright_3",
];
let emailAccountIdForCleanup: string | undefined;

test.afterEach(async ({ request }) => {
  if (emailAccountIdForCleanup) {
    await restoreActiveSnoozes(request, emailAccountIdForCleanup);
    emailAccountIdForCleanup = undefined;
  }
});

test("Command K acts on highlighted and selected conversations", async ({
  page,
}, testInfo) => {
  const accountsResponse = await page.request.get("/api/user/email-accounts");
  expect(accountsResponse.ok()).toBeTruthy();
  const { emailAccounts } = (await accountsResponse.json()) as {
    emailAccounts: { id: string }[];
  };
  const emailAccountId = emailAccounts[0]?.id;
  if (!emailAccountId) throw new Error("The setup project created no account");
  emailAccountIdForCleanup = emailAccountId;

  await restoreActiveSnoozes(page.request, emailAccountId);

  await page.goto(`/${emailAccountId}/mail`);
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations.getByRole("option")).toHaveCount(3, {
    timeout: 60_000,
  });
  await ensureReadState(page, conversations, "Alice Example", false);
  await ensureReadState(page, conversations, "Bob Example", true);

  await page.keyboard.press(`${commandModifier}+KeyK`);
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Archive conversation E" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark as read" }),
  ).toBeVisible();
  await expect(palette.getByRole("option", { name: "Snooze" })).toBeVisible();
  await expect(palette).not.toContainText("Applies to");
  await page.screenshot({
    path: testInfo.outputPath("01-command-palette-highlighted-row.png"),
  });

  await palette.getByRole("option", { name: "Snooze" }).click();
  await expect(
    palette.getByPlaceholder("When should it return? Try Friday at 3pm"),
  ).toBeFocused();
  await expect(
    palette.getByRole("option", { name: "In 3 hours" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Tomorrow morning" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Next week" }),
  ).toBeVisible();
  await expect(palette.getByText("Archive conversation")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("02-snooze-presets.png"),
  });

  const snoozeInput = palette.getByPlaceholder(
    "When should it return? Try Friday at 3pm",
  );
  await snoozeInput.fill("tomorrow at 3pm");
  const naturalLanguageOption = palette.getByRole("option", {
    name: /^Snooze until /,
  });
  await expect(naturalLanguageOption).toHaveCount(1);
  await expect(naturalLanguageOption).toBeVisible();
  await expect(naturalLanguageOption).toHaveAttribute("aria-selected", "true");
  await expect(palette.getByRole("option", { name: "In 3 hours" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("03-snooze-natural-language.png"),
  });

  await page.keyboard.press("Escape");
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("option", { name: "Snooze" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  await conversations
    .getByRole("checkbox", { name: "Select conversation from Alice Example" })
    .click();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Bob Example" })
    .click();

  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(
    palette.getByRole("option", { name: "Archive 2 conversations E" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as read" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as unread" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Snooze 2 conversations" }),
  ).toBeVisible();

  await palette.getByRole("option", { name: "Mark 2 as read" }).click();
  await expect(palette).toBeHidden();
  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(palette).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as read" }),
  ).toHaveCount(0);
  await expect(
    palette.getByRole("option", { name: "Mark as unread" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Alice Example" })
    .click();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Bob Example" })
    .click();
  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(
    palette.getByRole("option", { name: "Snooze 2 conversations" }),
  ).toBeVisible();
  await palette.getByRole("option", { name: "Snooze 2 conversations" }).click();
  await palette.getByRole("option", { name: "In 3 hours" }).click();
  await expect(conversations.getByRole("option")).toHaveCount(1);
});

async function ensureReadState(
  page: Page,
  conversations: Locator,
  sender: string,
  read: boolean,
) {
  const checkbox = conversations.getByRole("checkbox", {
    name: `Select conversation from ${sender}`,
  });
  await checkbox.click();
  const selectionCount = page.getByText("1 selected", { exact: true });
  await expect(selectionCount).toBeVisible();
  await page.keyboard.press(`${commandModifier}+KeyK`);
  const palette = page.getByRole("dialog");
  const desiredAction = palette.getByRole("option", {
    name: read ? "Mark as read" : "Mark as unread",
  });
  const oppositeAction = palette.getByRole("option", {
    name: read ? "Mark as unread" : "Mark as read",
  });
  await expect(desiredAction.or(oppositeAction)).toBeVisible();

  if (await desiredAction.isVisible()) {
    await desiredAction.click();
    await expect(palette).toBeHidden();
    await expect(selectionCount).toBeHidden();
    return;
  }

  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(selectionCount).toBeHidden();
}

async function restoreActiveSnoozes(
  request: APIRequestContext,
  emailAccountId: string,
) {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!internalApiKey) {
    throw new Error("Playwright INTERNAL_API_KEY is not configured");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "SnoozedThread"
       SET status = 'PENDING'
       WHERE "emailAccountId" = $1
         AND "threadId" = ANY($2)
         AND status = 'EXECUTING'`,
      [emailAccountId, SEEDED_THREAD_IDS],
    );
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "SnoozedThread"
       WHERE "emailAccountId" = $1
         AND "threadId" = ANY($2)
         AND status = 'PENDING'`,
      [emailAccountId, SEEDED_THREAD_IDS],
    );

    for (const { id } of result.rows) {
      const response = await request.post("/api/snoozed-threads/execute", {
        data: { snoozedThreadId: id },
        headers: {
          "x-api-key": internalApiKey,
        },
      });
      expect(response.ok()).toBeTruthy();
    }
  } finally {
    await client.end();
  }
}
