import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "../mail/mail-test-helpers";

const SUBJECT = "Project Label Message";
const GREETING = /^(Hey there|Good (morning|afternoon|evening))/;
const SUGGESTIONS = [
  "Help me handle my inbox today",
  "Clean up my inbox",
  "Suggest rules I should add",
];

test("attaches the open email to a new side chat", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(page, conversations, SUBJECT).click();
  await expect(page.getByRole("heading", { name: SUBJECT })).toBeVisible();

  await page.getByRole("button", { name: "Chat about this email" }).click();
  await expect(page.getByTestId("chat-input")).toBeVisible();

  const card = page.getByTestId("chat-context-card");
  await expect(card).toContainText(SUBJECT);
  await expect(card).toContainText("Harper Example");
  const greeting = page.getByRole("heading", {
    name: GREETING,
  });
  const suggestions = SUGGESTIONS.map((name) =>
    page.getByRole("button", { name }),
  );
  await expect(greeting).toHaveCount(0);
  for (const suggestion of suggestions) {
    await expect(suggestion).toHaveCount(0);
  }
  await capturePlaywrightCheckpoint(page, testInfo, "chat-email-context");

  await card.getByRole("button", { name: "Remove email from chat" }).click();
  await expect(card).toHaveCount(0);
  await expect(greeting).toBeVisible();
  for (const suggestion of suggestions) {
    await expect(suggestion).toBeVisible();
  }
});
