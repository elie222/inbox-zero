import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("renders links in plain text messages", async ({ page }) => {
  await page.route("**/api/threads/thr_playwright_reader?**", async (route) => {
    const response = await route.fetch();
    const body: ThreadResponse = await response.json();
    const message = body.thread.messages.at(-1);
    expect(message).toBeDefined();
    if (!message) throw new Error("Reader fixture has no messages");
    message.textHtml = "";
    message.textPlain =
      "Visit service.new/account\n\nhttps://staging.example.com/verify?token=value";
    await route.fulfill({ response, json: body });
  });

  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`, {
    waitUntil: "domcontentloaded",
  });

  const plainMessage = page.locator("li[data-thread-message-id]").last();
  const domainLink = plainMessage.getByRole("link", {
    name: "service.new/account",
    exact: true,
  });
  const secureLink = plainMessage.getByRole("link", {
    name: "https://staging.example.com/verify?token=value",
    exact: true,
  });
  await expect(domainLink).toHaveAttribute(
    "href",
    "http://service.new/account",
  );
  await expect(secureLink).toHaveAttribute(
    "href",
    "https://staging.example.com/verify?token=value",
  );
  await expect(domainLink).toHaveAttribute("target", "_blank");
  await expect(domainLink).toHaveAttribute("rel", "noopener noreferrer");
});
