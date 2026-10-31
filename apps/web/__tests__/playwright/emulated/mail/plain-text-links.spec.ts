import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("renders links in plain text messages", async ({ page }) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_plain_links`,
    {
      waitUntil: "domcontentloaded",
    },
  );

  const plainMessage = page.locator(
    'li[data-thread-message-id="msg_playwright_plain_links"]',
  );
  await expect(plainMessage).toBeVisible({ timeout: 60_000 });
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
