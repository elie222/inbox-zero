import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

const SUBJECT = "Re: Reader Visual Message";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGPQKnpKU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAIMZBFtzIGK3AAAAAElFTkSuQmCC",
  "base64",
);

test("keeps a conversation offline and reports when it is available", async ({
  page,
}, testInfo) => {
  await page.route("**/api/messages/attachment?**", (route) =>
    route.fulfill({ contentType: "image/png", body: PNG }),
  );

  const { conversations } = await openMail(page);
  await conversationWithSubject(page, conversations, SUBJECT).click();

  await page.getByRole("button", { name: /^More actions/ }).click();
  await page.getByRole("menuitem", { name: "Keep offline" }).click();

  const dialog = page.getByRole("dialog", {
    name: "Keep this conversation offline",
  });
  const confirm = dialog.getByRole("button", { name: "Keep offline" });
  await expect(confirm).toBeEnabled({ timeout: 60_000 });
  await expect(dialog.getByText(/^2 messages and 1 attachment$/)).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "keep-offline-quote");

  await confirm.click();

  // The download drains from the mail synchronization loop, which interleaves
  // it with index work, so this waits on the same budget as its siblings.
  await expect(dialog.getByText("Available offline")).toBeVisible({
    timeout: 90_000,
  });
  await expect(dialog.getByText(/^1 attachment stored \(/)).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "keep-offline-available");

  await dialog.getByRole("button", { name: "Remove offline copy" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^More actions/ }).click();
  await page.getByRole("menuitem", { name: "Keep offline" }).click();
  await expect(
    dialog.getByRole("button", { name: "Keep offline" }),
  ).toBeEnabled({ timeout: 60_000 });
  await expect(dialog.getByText("Available offline")).toBeHidden();
});
