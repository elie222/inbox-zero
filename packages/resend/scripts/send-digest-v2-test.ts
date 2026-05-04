// Send a one-shot test email of DigestV2Email to a real inbox via Resend.
// Reads RESEND_API_KEY + RESEND_FROM_EMAIL + TEST_TO from process env.
// Run (PowerShell):
//   $env:RESEND_API_KEY=(aws ssm get-parameter --region us-east-1 --name /inbox-zero/RESEND_API_KEY --with-decryption --query Parameter.Value --output text)
//   $env:RESEND_FROM_EMAIL=(aws ssm get-parameter --region us-east-1 --name /inbox-zero/RESEND_FROM_EMAIL --with-decryption --query Parameter.Value --output text)
//   $env:TEST_TO="rebekah@trueocean.com"
//   ../../node_modules/.bin/tsx scripts/send-digest-v2-test.ts

import { render } from "@react-email/render";
import { Resend } from "resend";
import DigestV2Email from "../emails/digest-v2";

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.TEST_TO;

  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  if (!from) throw new Error("RESEND_FROM_EMAIL not set");
  if (!to) throw new Error("TEST_TO not set");

  const html = await render(DigestV2Email(DigestV2Email.PreviewProps));

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "[TEST] Inbox Zero Daily Digest — Phase 4 mockup preview",
    html,
  });

  if (error) {
    console.error("Resend error:", error);
    process.exit(1);
  }

  console.log("Sent. Resend message id:", data?.id);
  console.log(`To: ${to}`);
  console.log(`From: ${from}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
