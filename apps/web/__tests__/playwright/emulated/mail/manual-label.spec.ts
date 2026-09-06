import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("applies an existing label from the reader menu and keeps the conversation in inbox", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(
    page,
    conversations,
    "Re: Reader Navigation Message",
  );
  await conversation.click();
  await page.getByRole("button", { name: /^More actions/ }).click();
  await page.getByRole("menuitem", { name: /^Label/ }).click();
  const picker = page.getByRole("dialog", { name: "Label conversations" });
  await picker.getByRole("combobox").fill("Project");
  await expect(
    picker.getByRole("option", { name: "Project Alpha", exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "search-label-picker");
  await picker
    .getByRole("option", { name: "Project Alpha", exact: true })
    .click();
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Project Alpha", exact: true }).last(),
  ).toBeVisible();
  const response = await page.request.get(
    "/api/threads/thr_playwright_reader",
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(response.ok()).toBeTruthy();
  const { thread } = await response.json();
  expect(thread.messages).toHaveLength(2);
  for (const message of thread.messages) {
    expect(message.labelIds).toEqual(
      expect.arrayContaining(["INBOX", "Label_project"]),
    );
  }
  await page
    .getByRole("button", { name: "Back to inbox", exact: true })
    .click();
  await expect(conversation).toBeVisible();
  await expect(
    conversation.getByText("Project Alpha", { exact: true }),
  ).toBeVisible();
});

test("creates and applies a label to selected conversations with L", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const labelName = `Manual Projects ${testInfo.retry}`;
  const first = conversationWithSubject(
    page,
    conversations,
    "Playwright Test Message",
  );
  const second = conversationWithSubject(
    page,
    conversations,
    "Read Command Message",
  );
  await first.getByRole("checkbox").click();
  await second.getByRole("checkbox").click();
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "Label conversations" });
  await expect(picker).toBeVisible();
  await picker.getByRole("combobox").fill(labelName);
  await expect(
    picker.getByRole("option", { name: `Create “${labelName}”` }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "create-label-picker");
  await picker.getByRole("option", { name: `Create “${labelName}”` }).click();
  await expect(picker).toBeHidden();
  await expect(first.getByText(labelName, { exact: true })).toBeVisible();
  await expect(second.getByText(labelName, { exact: true })).toBeVisible();
  const labelsResponse = await page.request.get("/api/labels", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  const { labels } = await labelsResponse.json();
  const label = labels.find(
    (label: { name: string }) => label.name === labelName,
  );
  expect(label).toBeTruthy();
  for (const threadId of ["thr_playwright_1", "thr_playwright_2"]) {
    const response = await page.request.get(`/api/threads/${threadId}`, {
      headers: { "X-Email-Account-ID": emailAccountId },
    });
    const { thread } = await response.json();
    for (const message of thread.messages) {
      expect(message.labelIds).toEqual(
        expect.arrayContaining(["INBOX", label.id]),
      );
    }
  }
  await page.getByRole("button", { name: "Label", exact: true }).click();
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
});

test("L labels the open conversation after it leaves the unread list", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  const conversation = conversationWithSubject(
    page,
    conversations,
    "Second Unread Command Message",
  );
  await conversation.click();
  const heading = page.getByRole("heading", {
    name: "Second Unread Command Message",
  });
  await expect(heading).toBeVisible();
  await expect(conversation).toHaveCount(0);
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "Label conversations" });
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(heading).toBeVisible();
  await page.keyboard.press("l");
  await picker.getByRole("combobox").fill("Project Alpha");
  await expect(
    picker.getByRole("option", { name: "Project Alpha", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(heading).toBeVisible();
  const response = await page.request.get("/api/threads/thr_playwright_3", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  const { thread } = await response.json();
  expect(thread.messages[0].labelIds).toEqual(
    expect.arrayContaining(["INBOX", "Label_project"]),
  );
});

test("keeps conversations available to retry after an interrupted labeling request", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(
    page,
    conversations,
    "Keyboard Navigation Message",
  );
  await conversation.getByRole("checkbox").click();
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "Label conversations" });
  const labelOption = picker.getByRole("option", {
    name: "Project Alpha",
    exact: true,
  });
  await expect(labelOption).toBeVisible();
  await page.route("**/mail**", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await labelOption.click();
  await expect(
    page.getByText("Couldn't label 1 conversation. Select a label to retry.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(picker).toBeVisible();
  await expect(labelOption).toBeEnabled();
  await page.unroute("**/mail**");
  await labelOption.click();
  await expect(picker).toBeHidden();
  await expect(
    conversation.getByText("Project Alpha", { exact: true }),
  ).toBeVisible();
  const response = await page.request.get(
    "/api/threads/thr_playwright_keyboard",
    {
      headers: { "X-Email-Account-ID": emailAccountId },
    },
  );
  expect(response.ok()).toBeTruthy();
  const { thread } = await response.json();
  expect(thread.messages[0].labelIds).toEqual(
    expect.arrayContaining(["INBOX", "Label_project"]),
  );
});
