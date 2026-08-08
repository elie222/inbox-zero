import { z } from "zod";
import type { ParsedMessage } from "@/utils/types";

const gmailCursorSchema = z.object({
  version: z.literal(1),
  provider: z.literal("google"),
  phase: z.enum(["snapshot", "delta"]),
  historyId: z.string().regex(/^\d+$/),
  after: z.string().datetime(),
  pageToken: z.string().min(1).optional(),
});

const microsoftCursorSchema = z.object({
  version: z.literal(1),
  provider: z.literal("microsoft"),
  deltaLink: z.string().url(),
  after: z.string().datetime(),
  snapshot: z.boolean(),
});

const cursorSchema = z.discriminatedUnion("provider", [
  gmailCursorSchema,
  microsoftCursorSchema,
]);

export type MailboxSyncCursor = z.infer<typeof cursorSchema>;

export class InvalidMailboxSyncCursorError extends Error {
  constructor() {
    super("Invalid mailbox sync cursor");
    this.name = "InvalidMailboxSyncCursorError";
  }
}

export function encodeMailboxSyncCursor(cursor: MailboxSyncCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeMailboxSyncCursor<
  TProvider extends MailboxSyncCursor["provider"],
>(
  cursor: string,
  provider: TProvider,
): Extract<MailboxSyncCursor, { provider: TProvider }> {
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    if (parsed.provider !== provider) {
      throw new InvalidMailboxSyncCursorError();
    }
    if (
      parsed.provider === "microsoft" &&
      !isAllowedMicrosoftDeltaLink(parsed.deltaLink)
    ) {
      throw new InvalidMailboxSyncCursorError();
    }
    return parsed as Extract<MailboxSyncCursor, { provider: TProvider }>;
  } catch (error) {
    if (error instanceof InvalidMailboxSyncCursorError) throw error;
    throw new InvalidMailboxSyncCursorError();
  }
}

export function compactMailboxSyncMessage(
  message: ParsedMessage,
): ParsedMessage {
  return {
    ...message,
    attachments: undefined,
    inline: [],
    rawRecipients: undefined,
    textHtml: undefined,
    textPlain: undefined,
  };
}

function isAllowedMicrosoftDeltaLink(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "graph.microsoft.com" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.hash === "" &&
    /^\/v1\.0\/me\/mailFolders(?:\/[^/]+|\('[^']+'\))\/messages\/delta$/i.test(
      url.pathname,
    ) &&
    (url.searchParams.has("$skiptoken") || url.searchParams.has("$deltatoken"))
  );
}
