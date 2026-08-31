import { expect, test } from "@playwright/test";
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
    await page.getByRole("menuitem", { name: "Choose accounts" }).click();

    const dialog = page.getByRole("dialog", { name: "Choose accounts" });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Choose accounts" }),
    ).toBeHidden();
    await expect(
      dialog.getByRole("checkbox", { name: new RegExp(secondAccount.name) }),
    ).toBeChecked();

    await page.locator("nextjs-portal").evaluateAll((portals) => {
      for (const portal of portals) portal.remove();
    });
    const screenshot = await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("all-accounts-selection.png"),
    });
    await testInfo.attach("all-accounts-selection", {
      body: screenshot,
      contentType: "image/png",
    });

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
