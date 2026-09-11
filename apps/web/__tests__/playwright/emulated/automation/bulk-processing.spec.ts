import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { markAutomationOnboardingViewed } from "./automation-tabs-test-helpers";

for (const tier of ["PLUS_MONTHLY", "PROFESSIONAL_MONTHLY"] as const) {
  test(`explains historical read-email access for ${tier}`, async ({
    page,
  }) => {
    const emailAccountId = await getEmailAccountId(page);
    await markAutomationOnboardingViewed(page);
    await page.route("**/api/user/me", async (route) => {
      const response = await route.fetch();
      const user = await response.json();
      await route.fulfill({
        response,
        json: {
          ...user,
          premium: {
            ...user.premium,
            tier,
            stripeSubscriptionStatus: "active",
          },
        },
      });
    });

    await page.goto(`/${emailAccountId}/automation`);
    const dialog = page.getByRole("dialog", { name: "Bulk Process Emails" });
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Process Past Emails" }).click();
      }
      await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(
      dialog.getByText("Run your rules on emails already in your inbox."),
    ).toBeVisible();
    const includeRead = dialog.getByRole("switch").first();

    if (tier === "PLUS_MONTHLY") {
      await expect(includeRead).toBeDisabled();
      await expect(
        dialog.getByText(
          "Including read emails is available on the Professional plan.",
        ),
      ).toBeVisible();
    } else {
      await expect(includeRead).toBeEnabled();
      await includeRead.click();
      await expect(includeRead).toBeChecked();
    }
  });
}
