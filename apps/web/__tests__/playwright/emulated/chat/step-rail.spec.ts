import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { getEmailAccountId } from "../account-test-helpers";
import {
  STEP_RAIL_CHATS,
  cleanupStepRailChats,
  seedStepRailChats,
} from "./step-rail-test-helpers";

const WIDTHS = { desktop: 1000, narrow: 390 } as const;

test.afterEach(async () => {
  await cleanupStepRailChats();
});

test("shows running, done and failed steps on the rail with a run footer", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedStepRailChats(emailAccountId);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });

    for (const [widthName, width] of Object.entries(WIDTHS)) {
      await page.setViewportSize({ width, height: 900 });

      for (const [key, chat] of Object.entries(STEP_RAIL_CHATS)) {
        await page.goto(`/${emailAccountId}/assistant`);
        await page.getByRole("button", { name: "Chat History" }).click();
        await page.getByRole("menuitem", { name: chat.name }).click();

        const rail = page.getByRole("list", { name: "Assistant steps" });
        await expect(rail).toBeVisible();
        await expect(rail.getByText("Searched inbox for Chase")).toBeVisible();
        await expect(rail.getByText("6 emails")).toBeVisible();
        await expect(rail.getByText("Previewed your rules")).toBeVisible();
        await expect(rail.getByText("matched Bills")).toBeVisible();
        await expect(rail.getByText("Couldn't read email")).toBeVisible();
        await expect(rail.getByText("Message was deleted")).toBeVisible();

        const footer = page.getByText("gemma4 12B · Thinking off · 8.4 s");
        if (key === "midRun") {
          await expect(rail.getByText("Archiving emails…")).toBeVisible();
          await expect(footer).toHaveCount(0);
        } else {
          await expect(rail.getByText("Archived emails")).toBeVisible();
          await expect(footer).toBeVisible();
        }

        await capturePlaywrightCheckpoint(
          page,
          testInfo,
          `step-rail-${key}-${colorScheme}-${widthName}`,
        );
      }
    }
  }
});
