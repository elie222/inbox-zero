import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DemoInboxAddress,
  DemoInboxFixture,
  DemoInboxMessage,
} from "../__tests__/fixtures/inboxes/types";
import { saasFounderMixedInbox } from "../__tests__/fixtures/inboxes/demo-inboxes";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "../../..");
const OUTPUT_PATH = resolve(SCRIPT_DIR, "../.tmp/emulate.generated.json");

const GOOGLE_EMAIL = "developer@example.com";
const GOOGLE_NAME = "Developer";
const MICROSOFT_EMAIL = "developer@outlook.test";
const MICROSOFT_NAME = "Developer";

async function main() {
  const seed = {
    google: {
      users: [{ email: GOOGLE_EMAIL, name: GOOGLE_NAME }],
      oauth_clients: [
        {
          client_id: "emulate-google-client.apps.googleusercontent.com",
          client_secret: "emulate-google-secret",
          redirect_uris: [
            "http://localhost:3000/api/auth/oauth2/callback/google",
            "http://localhost:3000/api/auth/callback/google",
            "http://localhost:3000/api/google/linking/callback",
            "http://localhost:3000/api/google/calendar/callback",
            "http://localhost:3000/api/google/drive/callback",
          ],
        },
      ],
      labels: toSeedLabels(saasFounderMixedInbox, GOOGLE_EMAIL),
      messages: toSeedMessages(saasFounderMixedInbox, {
        email: GOOGLE_EMAIL,
        name: GOOGLE_NAME,
      }),
      calendars: [
        {
          id: "primary",
          user_email: GOOGLE_EMAIL,
          summary: GOOGLE_EMAIL,
          primary: true,
          selected: true,
          time_zone: "UTC",
        },
      ],
      drive_items: [
        {
          id: "drv_root_child",
          user_email: GOOGLE_EMAIL,
          name: "Smoke Docs",
          mime_type: "application/vnd.google-apps.folder",
          parent_ids: ["root"],
        },
      ],
    },
    microsoft: {
      users: [{ email: MICROSOFT_EMAIL, name: MICROSOFT_NAME }],
      oauth_clients: [
        {
          client_id: "emulate-microsoft-client-id",
          client_secret: "emulate-microsoft-secret",
          redirect_uris: [
            "http://localhost:3000/api/auth/oauth2/callback/microsoft",
            "http://localhost:3000/api/auth/callback/microsoft",
            "http://localhost:3000/api/outlook/linking/callback",
            "http://localhost:3000/api/outlook/calendar/callback",
            "http://localhost:3000/api/outlook/drive/callback",
          ],
        },
      ],
    },
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Wrote emulator seed to ${relativeToRoot(OUTPUT_PATH)}`);
}

function toSeedLabels(fixture: DemoInboxFixture, userEmail: string) {
  return fixture.labels.map((label) => ({
    id: label.id,
    user_email: userEmail,
    name: label.name,
    type: label.type,
  }));
}

function toSeedMessages(
  fixture: DemoInboxFixture,
  mailbox: { email: string; name: string },
) {
  const labelIdsByName = new Map(
    fixture.labels.map((label) => [label.name, label.id]),
  );

  return fixture.threads.flatMap((thread) =>
    thread.messages.map((message) => ({
      id: message.id,
      thread_id: thread.id,
      user_email: mailbox.email,
      from: formatAddress(
        rewriteMailboxAddress(fixture, message.from, mailbox),
      ),
      to: message.to
        .map((address) =>
          formatAddress(rewriteMailboxAddress(fixture, address, mailbox)),
        )
        .join(", "),
      cc: message.cc
        ?.map((address) =>
          formatAddress(rewriteMailboxAddress(fixture, address, mailbox)),
        )
        .join(", "),
      subject: message.subject,
      body_text: message.bodyText,
      body_html: message.bodyHtml,
      label_ids: getMessageLabelIds(message, labelIdsByName),
      internal_date: String(new Date(message.date).getTime()),
    })),
  );
}

function getMessageLabelIds(
  message: DemoInboxMessage,
  labelIdsByName: Map<string, string>,
) {
  const labelIds = new Set(
    (message.labels ?? ["INBOX"]).map(
      (label) => labelIdsByName.get(label) ?? label,
    ),
  );

  if (message.unread) labelIds.add("UNREAD");

  return [...labelIds];
}

function rewriteMailboxAddress(
  fixture: DemoInboxFixture,
  address: DemoInboxAddress,
  mailbox: { email: string; name: string },
): DemoInboxAddress {
  if (address.email !== fixture.mailbox.email) return address;

  return {
    email: mailbox.email,
    name: address.name ? mailbox.name : undefined,
  };
}

function formatAddress(address: DemoInboxAddress) {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

function relativeToRoot(path: string) {
  return path.replace(`${ROOT_DIR}/`, "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
