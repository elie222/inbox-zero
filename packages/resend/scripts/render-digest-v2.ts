// Render DigestV2Email to a static HTML file using its PreviewProps fixture.
// Output is committed nowhere — it's a local visual check.
// Run: pnpm --filter @inboxzero/resend tsx scripts/render-digest-v2.ts
//   or, from the resend package dir: ../../node_modules/.bin/tsx scripts/render-digest-v2.ts

import { render } from "@react-email/render";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import DigestV2Email from "../emails/digest-v2";

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(
    __dirname,
    "../../../.planning/phases/04-daily-digest/digest-v2-rendered.html",
  );

  const props = DigestV2Email.PreviewProps;
  const html = await render(DigestV2Email(props));

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");

  console.log(`Rendered → ${outPath}`);
  console.log(`Size: ${html.length} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
