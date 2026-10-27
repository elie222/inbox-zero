import { expect } from "@playwright/test";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

test.use({ allowPageErrors: true });

test("recovers the same mailbox draft after its creation response is lost", async ({
  page,
}, testInfo) => {
  const accountId = await getEmailAccountId(page);
  await page.goto(`/${accountId}/mail?thread-id=thr_playwright_reader_visual`);
  const subject = `Draft recovery ${Date.now()}`;
  let droppedResponse = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (
      !droppedResponse &&
      request.method() === "POST" &&
      request.headers()["next-action"] &&
      body.includes(subject) &&
      body.includes('"requestId"')
    ) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      droppedResponse = true;
      await route.abort("connectionclosed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("Subject").fill(subject);
  await dialog
    .getByRole("textbox", { name: "Email message" })
    .fill("Draft before the response was lost.");
  await expect.poll(() => droppedResponse, { timeout: 120_000 }).toBe(true);
  await dialog
    .getByRole("textbox", { name: "Email message" })
    .fill("Recovered draft revision 2.");
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/threads?type=draft", {
          headers: { [EMAIL_ACCOUNT_HEADER]: accountId },
        });
        if (!response.ok()) return false;
        const data: ThreadsResponse = await response.json();
        const messages = data.threads
          .flatMap((thread) => thread.messages)
          .filter((message) => message.headers.subject === subject);
        return (
          messages.length === 1 &&
          (messages[0].textPlain ?? messages[0].textHtml ?? "").includes(
            "Recovered draft revision 2.",
          )
        );
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  await expect(
    dialog.getByText(/Mailbox draft creation could not be confirmed/),
  ).toHaveCount(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mailbox-draft-response-recovered",
  );
});
