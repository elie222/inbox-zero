import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { setLocalPassword } from "../utils/auth/local-password";
import prisma from "../utils/prisma";

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" } } });
  if (!values.email || process.stdin.isTTY) {
    throw new Error(
      "Usage: provide a password on stdin to pnpm exec tsx scripts/set-local-password.ts --email you@example.com",
    );
  }
  const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  await setLocalPassword({ email: values.email, password });
  console.log(
    "Local password saved. Existing mailbox connections are unchanged.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Could not set local password",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
