import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import { openMail } from "./mail-test-helpers";

test("chooses which accounts appear in All Accounts", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);

  try {
    await page.reload();
    await page
      .getByRole("button", { name: /playwright-test\+/i })
      .last()
      .click();
    const chooseAccountsMenuItem = page.getByRole("menuitem", {
      name: "Choose accounts",
    });
    await expect(chooseAccountsMenuItem).toBeVisible();

    await page.locator("nextjs-portal").evaluateAll((portals) => {
      for (const portal of portals) portal.remove();
    });
    await expect(page.getByRole("menu").locator("kbd")).toHaveCount(0);

    await page.addInitScript(() => {
      Object.assign(window, {
        inboxZeroDesktop: { startAuth: async () => {} },
      });
    });
    for (const { userAgent, modifier, checkpoint } of [
      {
        userAgent: "Macintosh",
        modifier: "⌘",
        checkpoint: "account-shortcuts-mac",
      },
      {
        userAgent: "Windows NT 10.0",
        modifier: "Ctrl+",
        checkpoint: "account-shortcuts-windows",
      },
    ]) {
      await page.reload();
      await page.evaluate((userAgent) => {
        Object.defineProperty(navigator, "userAgent", {
          configurable: true,
          get: () => userAgent,
        });
      }, userAgent);
      await page
        .getByRole("button", { name: /playwright-test\+/i })
        .last()
        .click();
      await expect(page.getByRole("menu").locator("kbd")).toHaveText([
        `${modifier}0`,
        `${modifier}1`,
        `${modifier}2`,
      ]);
      await capturePlaywrightCheckpoint(page, testInfo, checkpoint);
    }

    await chooseAccountsMenuItem.click();

    const dialog = page.getByRole("dialog", { name: "Choose accounts" });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Choose accounts" }),
    ).toBeHidden();
    await expect(
      dialog.getByRole("checkbox", { name: new RegExp(secondAccount.name) }),
    ).toBeChecked();

    await capturePlaywrightCheckpoint(page, testInfo, "all-accounts-selection");

    await dialog
      .getByRole("checkbox", { name: new RegExp(secondAccount.name) })
      .uncheck();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("All Accounts updated", { exact: true }),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const response = await page.request.get("/api/user/email-accounts");
        const data = (await response.json()) as {
          emailAccounts: Array<{
            id: string;
            includeInAllAccounts: boolean;
          }>;
        };
        return data.emailAccounts.find(
          (emailAccount) => emailAccount.id === secondAccount.id,
        )?.includeInAllAccounts;
      })
      .toBe(false);
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("reorders accounts by dragging them in the switcher", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);

  try {
    await page.reload();
    const openSwitcher = () =>
      page
        .getByRole("button", { name: /playwright-test\+/i })
        .last()
        .click();
    await openSwitcher();
    const accounts = page.getByRole("menu").locator("[data-account-id]");
    await expect(accounts).toHaveCount(2);
    const original = await accounts.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-account-id")),
    );
    expect(original).toEqual([emailAccountId, secondAccount.id]);
    const expected = [secondAccount.id, emailAccountId];

    await accounts.nth(1).hover();
    await page.mouse.down();
    const target = await accounts.nth(0).boundingBox();
    if (!target) throw new Error("Account is not visible");
    await page.mouse.move(target.x + target.width / 2, target.y + 4, {
      steps: 5,
    });
    await expect
      .poll(() =>
        accounts.evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-account-id")),
        ),
      )
      .toEqual(expected);
    await page.locator("nextjs-portal").evaluateAll((portals) => {
      for (const portal of portals) portal.remove();
    });
    await capturePlaywrightCheckpoint(page, testInfo, "account-switcher-drag");
    await page.mouse.up();

    // Dropping an account reorders it without switching to it.
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(emailAccountId));

    await expect
      .poll(async () => {
        const response = await page.request.get("/api/user/email-accounts");
        const data = (await response.json()) as {
          emailAccounts: Array<{ id: string }>;
        };
        return data.emailAccounts.map((emailAccount) => emailAccount.id);
      })
      .toEqual(expected);

    await page.reload();
    await openSwitcher();
    await expect(accounts).toHaveCount(2);
    await expect
      .poll(() =>
        accounts.evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-account-id")),
        ),
      )
      .toEqual(expected);
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});
