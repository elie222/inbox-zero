import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("admin creates and revokes an expiring SCIM credential", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.PLAYWRIGHT_SCIM_TEST !== "true",
    "Run with PLAYWRIGHT_SCIM_TEST=true",
  );
  const providerId = `scim-test-${randomUUID()}`;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      'INSERT INTO "Organization" (id, name, slug, "createdAt", "updatedAt") VALUES ($1, $2, $1, NOW(), NOW())',
      [providerId, "SCIM test organization"],
    );
    await db.query(
      'INSERT INTO "ssoProvider" (id, issuer, "providerId", "organizationId", domain) VALUES ($1, $2, $1, $1, $3)',
      [providerId, "https://idp.example.com", "example.com"],
    );
    await page.goto("/admin");
    const section = page.getByRole("region", { name: "SCIM provisioning" });
    await expect(section).toBeVisible();
    await capturePlaywrightCheckpoint(
      section,
      testInfo,
      "scim-credential-admin",
    );
    await section
      .getByLabel("SSO provider ID", { exact: true })
      .fill(providerId);
    await section.getByLabel("Credential expires at").fill("2099-01-01T12:00");
    await section
      .getByRole("button", { name: "Create SCIM connection" })
      .click();
    const issued = section.getByLabel(
      "New SCIM credential — save before leaving",
    );
    await expect(issued).toBeVisible();
    const value = await issued.inputValue();
    const token = value.split("\n")[0].replace("Bearer token: ", "");
    const connectionId = value.split("\n")[1].replace("Connection ID: ", "");
    const credentialId = value.split("\n")[2].replace("Credential ID: ", "");
    assert(token && connectionId && credentialId);
    const headers = { Authorization: `Bearer ${token}` };
    expect(
      (await request.get("/api/auth/scim/v2/Users", { headers })).status(),
    ).toBe(200);
    await section.getByLabel("SSO provider ID to revoke").fill(providerId);
    await section
      .getByLabel("Connection ID", { exact: true })
      .fill(connectionId);
    await section
      .getByLabel("Credential ID", { exact: true })
      .fill(credentialId);
    await section
      .getByRole("button", { name: "Revoke SCIM credential" })
      .click();
    await expect(
      page.getByText("SCIM credential revoked", { exact: true }),
    ).toBeVisible();
    expect(
      (await request.get("/api/auth/scim/v2/Users", { headers })).status(),
    ).toBe(401);
    await section
      .getByRole("button", { name: "Clear saved credential from screen" })
      .click();
    await expect(issued).toBeHidden();
  } finally {
    await db.query('DELETE FROM "Organization" WHERE id = $1', [providerId]);
    await db.end();
  }
});
