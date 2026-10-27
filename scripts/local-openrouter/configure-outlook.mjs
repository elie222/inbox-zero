import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  if (!process.argv[2]) throw new Error("Pass the path to your Microsoft OAuth credentials JSON.");
  const credentials = JSON.parse(readFileSync(resolve(process.argv[2]), "utf8").replace(/^\uFEFF/, ""));
  const clientId = credentials.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = credentials.MICROSOFT_CLIENT_SECRET;
  const tenant = credentials.MICROSOFT_TENANT_ID?.trim() || "common";
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid.test(clientId ?? "")) throw new Error("MICROSOFT_CLIENT_ID must be the Application (client) ID from Entra.");
  if (typeof clientSecret !== "string" || clientSecret.length < 8 || /[\r\n]/.test(clientSecret) || clientSecret.startsWith("REPLACE_")) {
    throw new Error("MICROSOFT_CLIENT_SECRET must be the new secret's Value, not its Secret ID.");
  }
  if (!["common", "consumers", "organizations"].includes(tenant) && !guid.test(tenant)) {
    throw new Error("MICROSOFT_TENANT_ID must be common, consumers, organizations, or a tenant GUID.");
  }
  const envPath = resolve(import.meta.dirname, "../../apps/web/.env.local");
  let content = readFileSync(envPath, "utf8");
  const updates = {
    MICROSOFT_CLIENT_ID: clientId,
    MICROSOFT_CLIENT_SECRET: clientSecret,
    MICROSOFT_TENANT_ID: tenant,
  };
  if (!/^MICROSOFT_WEBHOOK_CLIENT_STATE=.+$/m.test(content)) {
    updates.MICROSOFT_WEBHOOK_CLIENT_STATE = randomBytes(32).toString("hex");
  }
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${JSON.stringify(value)}`;
    content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envPath, content);
  console.log("Microsoft OAuth credentials saved privately. Stop and restart Inbox Zero, then add Outlook from the Accounts page.");
} catch {
  console.error("Microsoft credentials were not imported. Use the JSON format in OUTLOOK-SETUP.md with a valid client ID, secret Value, and tenant.");
  process.exitCode = 1;
}
