import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  if (!process.argv[2]) throw new Error("Pass the path to the Google OAuth Web application credentials JSON.");
  const credentials = JSON.parse(readFileSync(resolve(process.argv[2]), "utf8")).web;
  if (!credentials?.client_id?.endsWith(".apps.googleusercontent.com") || !credentials?.client_secret) {
    throw new Error("Expected a Google OAuth Web application credentials JSON.");
  }
  const envPath = resolve(import.meta.dirname, "../../apps/web/.env.local");
  let content = readFileSync(envPath, "utf8");
  for (const [key, value] of [["GOOGLE_CLIENT_ID", credentials.client_id], ["GOOGLE_CLIENT_SECRET", credentials.client_secret]]) {
    if (/[\r\n]/.test(value)) throw new Error("Invalid credential value");
    content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${JSON.stringify(value)}`);
  }
  writeFileSync(envPath, content);
  console.log("Gmail OAuth credentials saved privately. Stop and restart Inbox Zero, then sign in at http://localhost:3000/login");
} catch {
  console.error("Google credentials were not imported. Pass a valid OAuth Web application JSON and ensure apps/web/.env.local exists. Credential values are not displayed.");
  process.exitCode = 1;
}
