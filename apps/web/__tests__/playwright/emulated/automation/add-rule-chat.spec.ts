import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  expectVisibleAfterTransientFetch,
  markAutomationOnboardingViewed,
} from "./automation-tabs-test-helpers";

test("Add Rule opens the chat with a focused, unsent starter", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);

  await page.goto(`/${emailAccountId}/automation`);
  await expectVisibleAfterTransientFetch(
    page,
    page.getByRole("heading", { name: "AI Assistant", exact: true }),
  );

  await page.getByRole("button", { name: "Add Rule", exact: true }).click();

  const chatInput = page.getByTestId("chat-input");
  await expect(chatInput).toHaveValue("Add a rule: ");
  await expect(chatInput).toBeFocused();
  await expect(
    chatInput.evaluate((el: HTMLTextAreaElement) => el.selectionStart),
  ).resolves.toBe("Add a rule: ".length);
});
