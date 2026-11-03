import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";

// Autosave writes the reply to the mailbox several times while it is typed,
// and each save syncs back into the open thread as a new message. None of that
// may take the editor away from the person typing in it.

test("keeps a new reply's editor mounted and focused while autosave syncs", async ({
  page,
}) => {
  test.setTimeout(400_000);
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible({ timeout: 240_000 });
  await message.getByRole("button", { name: "Reply", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Email message" });
  await expect(editor).toBeFocused({ timeout: 120_000 });

  await expectSteadyWhileTyping(page);
});

test("keeps a saved draft's editor mounted and focused while autosave syncs", async ({
  page,
}) => {
  test.skip(
    isMicrosoftPlaywright(),
    "The saved reply draft is seeded in the Google emulator.",
  );
  test.setTimeout(400_000);
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_draft_typing`);
  const editor = page.getByRole("textbox", { name: "Email message" });
  await expect(editor).toContainText("Saved reply draft.", {
    timeout: 240_000,
  });
  await editor.click();
  await editor.evaluate((element) => {
    const paragraph = element.querySelector("p") ?? element;
    window.getSelection()?.collapse(paragraph, paragraph.childNodes.length);
  });
  await expect(editor).toBeFocused();

  await expectSteadyWhileTyping(page);
  await expect(editor).toContainText("Saved reply draft.");
});

async function expectSteadyWhileTyping(page: Page) {
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[role="textbox"][aria-label="Email message"]',
    );
    const glitches: string[] = [];
    (window as unknown as { __glitches: string[] }).__glitches = glitches;
    const started = performance.now();
    const stamp = (reason: string) =>
      glitches.push(`${Math.round(performance.now() - started)}ms ${reason}`);
    let detached = false;
    let blurred = false;
    let shownLoading = "";
    const check = () => {
      if (!detached && !target?.isConnected) {
        detached = true;
        stamp("editor detached");
      }
      const focused =
        document.activeElement?.closest('[aria-label="Email message"]') != null;
      if (focused === blurred) {
        blurred = !focused;
        stamp(
          focused
            ? "focus back in an editor"
            : `focus left the editor to ${document.activeElement?.tagName}`,
        );
      }
      const loading = Array.from(document.querySelectorAll('[role="status"]'))
        .map((status) => status.textContent ?? "")
        .filter((text) => /Loading/.test(text))
        .join(", ");
      if (loading !== shownLoading) {
        shownLoading = loading;
        if (loading) stamp(`status: ${loading}`);
      }
      requestAnimationFrame(check);
    };
    check();
  });

  // Slow enough that several autosaves land mid-sentence.
  for (let round = 0; round < 6; round++) {
    await page.keyboard.type(`Sentence ${round} of a careful reply. `, {
      delay: 60,
    });
    await page.waitForTimeout(2500);
  }

  const glitches = await page.evaluate(
    () => (window as unknown as { __glitches: string[] }).__glitches,
  );
  expect(glitches).toEqual([]);
  const editor = page.getByRole("textbox", { name: "Email message" });
  await expect(editor).toHaveCount(1);
  await expect(editor).toContainText("Sentence 5 of a careful reply.");
}
