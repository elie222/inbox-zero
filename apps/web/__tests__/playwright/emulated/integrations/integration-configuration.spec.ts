import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  getIntegrationRow,
  getIntegrationToolCard,
  openIntegrations,
  resetIntegrationTestState,
  setupIntegrationTestState,
} from "./integration-test-helpers";

test.beforeEach(async () => {
  await setupIntegrationTestState();
});

test.afterEach(async () => {
  await resetIntegrationTestState();
});

test("persists which read tools are enabled", async ({ page }) => {
  test.setTimeout(360_000);
  await openIntegrations(page);

  const notionRow = getIntegrationRow(page, "Notion");
  await expect(notionRow.getByText("Connected", { exact: false })).toBeVisible({
    timeout: 60_000,
  });
  await notionRow.getByRole("button", { name: "Integration actions" }).click();
  await page
    .getByRole("menuitem", { name: "Manage tools (1 of 2 on)" })
    .click();

  const fetchToolCard = getIntegrationToolCard(page, "notion-fetch");
  const fetchToolSwitch = fetchToolCard.getByRole("switch");
  await expect(fetchToolSwitch).toBeChecked();
  await fetchToolSwitch.click();
  await expect(page.getByText("Tool updated", { exact: true })).toBeVisible({
    timeout: 120_000,
  });

  await openIntegrations(page);
  await expect(notionRow.getByText("Connected", { exact: false })).toBeVisible({
    timeout: 60_000,
  });
  await notionRow.getByRole("button", { name: "Integration actions" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Manage tools (0 of 2 on)" }),
  ).toBeVisible();
});

test("persists pause state and disconnects the integration", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await openIntegrations(page);

  const notionRow = getIntegrationRow(page, "Notion");
  await expect(notionRow.getByText("Connected", { exact: false })).toBeVisible({
    timeout: 60_000,
  });
  await notionRow.getByRole("button", { name: "Integration actions" }).click();
  await page.getByRole("menuitem", { name: "Pause" }).click();
  await expect(page.getByText("Notion paused", { exact: true })).toBeVisible({
    timeout: 120_000,
  });

  await openIntegrations(page);
  await expect(notionRow.getByText("Paused", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await notionRow.getByRole("button", { name: "Integration actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Resume" })).toBeVisible();
  await page.keyboard.press("Escape");

  page.once("dialog", (dialog) => dialog.accept());
  await notionRow.getByRole("button", { name: "Integration actions" }).click();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await expect(
    page.getByText("Disconnected successfully", { exact: true }),
  ).toBeVisible({ timeout: 120_000 });

  await openIntegrations(page);
  await expect(
    notionRow.getByRole("button", { name: "Connect", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
});
