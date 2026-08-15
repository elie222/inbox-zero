import { expect, test } from "@playwright/test";

const commandModifier = process.platform === "darwin" ? "Meta" : "Control";

test("Command K acts on highlighted and selected conversations", async ({
  page,
}, testInfo) => {
  const accountsResponse = await page.request.get("/api/user/email-accounts");
  expect(accountsResponse.ok()).toBeTruthy();
  const { emailAccounts } = (await accountsResponse.json()) as {
    emailAccounts: { id: string }[];
  };
  const emailAccountId = emailAccounts[0]?.id;
  if (!emailAccountId) throw new Error("The setup project created no account");

  await page.goto(`/${emailAccountId}/mail`);
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations.getByRole("option")).toHaveCount(3);

  await page.keyboard.press(`${commandModifier}+KeyK`);
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Archive conversation E" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark as read" }),
  ).toBeVisible();
  await expect(palette.getByRole("option", { name: "Snooze" })).toBeVisible();
  await expect(palette).not.toContainText("Applies to");
  await page.screenshot({
    path: testInfo.outputPath("01-command-palette-highlighted-row.png"),
  });

  await palette.getByRole("option", { name: "Snooze" }).click();
  await expect(
    palette.getByPlaceholder("When should it return? Try Friday at 3pm"),
  ).toBeFocused();
  await expect(
    palette.getByRole("option", { name: "In 3 hours" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Tomorrow morning" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Next week" }),
  ).toBeVisible();
  await expect(palette.getByText("Archive conversation")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("02-snooze-presets.png"),
  });

  const snoozeInput = palette.getByPlaceholder(
    "When should it return? Try Friday at 3pm",
  );
  await snoozeInput.fill("tomorrow at 3pm");
  const naturalLanguageOption = palette.getByRole("option", {
    name: /Snooze until .* at 3:00 PM/,
  });
  await expect(naturalLanguageOption).toBeVisible();
  await expect(naturalLanguageOption).toHaveAttribute("aria-selected", "true");
  await expect(palette.getByRole("option", { name: "In 3 hours" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("03-snooze-natural-language.png"),
  });

  await page.keyboard.press("Escape");
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("option", { name: "Snooze" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  await conversations
    .getByRole("checkbox", { name: "Select conversation from Alice Example" })
    .click();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Bob Example" })
    .click();

  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(
    palette.getByRole("option", { name: "Archive 2 conversations E" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as read" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as unread" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Snooze 2 conversations" }),
  ).toBeVisible();

  await palette.getByRole("option", { name: "Mark 2 as read" }).click();
  await expect(palette).toBeHidden();
  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(palette).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as read" }),
  ).toHaveCount(0);
  await expect(
    palette.getByRole("option", { name: "Mark as unread" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Alice Example" })
    .click();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Bob Example" })
    .click();
  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(
    palette.getByRole("option", { name: "Snooze 2 conversations" }),
  ).toBeVisible();
  await palette.getByRole("option", { name: "Snooze 2 conversations" }).click();
  await palette.getByRole("option", { name: "In 3 hours" }).click();
  await expect(page.getByText("Snoozed 2 conversations")).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
});
