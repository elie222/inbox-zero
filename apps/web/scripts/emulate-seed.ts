import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  DemoInboxAddress,
  DemoInboxFixture,
  DemoInboxMessage,
} from "../__tests__/fixtures/inboxes/types";
import { saasFounderMixedInbox } from "../__tests__/fixtures/inboxes/demo-inboxes";

const DEFAULT_BASE_URL = "http://localhost:3000";
const GOOGLE_EMAIL = "developer@example.com";
const GOOGLE_NAME = "Developer";
const MICROSOFT_EMAIL = "developer@outlook.test";
const MICROSOFT_NAME = "Developer";

export function buildEmulateSeed(baseUrl = DEFAULT_BASE_URL) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/u, "");

  return {
    google: {
      users: [{ email: GOOGLE_EMAIL, name: GOOGLE_NAME }],
      oauth_clients: [
        {
          client_id: "emulate-google-client.apps.googleusercontent.com",
          client_secret: "emulate-google-secret",
          redirect_uris: [
            `${normalizedBaseUrl}/api/auth/oauth2/callback/google`,
            `${normalizedBaseUrl}/api/auth/callback/google`,
            `${normalizedBaseUrl}/api/google/linking/callback`,
            `${normalizedBaseUrl}/api/google/calendar/callback`,
            `${normalizedBaseUrl}/api/google/drive/callback`,
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
            `${normalizedBaseUrl}/api/auth/oauth2/callback/microsoft`,
            `${normalizedBaseUrl}/api/auth/callback/microsoft`,
            `${normalizedBaseUrl}/api/outlook/linking/callback`,
            `${normalizedBaseUrl}/api/outlook/calendar/callback`,
            `${normalizedBaseUrl}/api/outlook/drive/callback`,
          ],
        },
      ],
    },
  };
}

export async function writeEmulateSeed(outputPath: string, baseUrl?: string) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(buildEmulateSeed(baseUrl), null, 2)}\n`,
  );
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
