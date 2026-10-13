import { createHash } from "node:crypto";
import type { ParsedMessage } from "@/utils/types";

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function lookupToken(token: string) {
  // Width folding must not perform the other compatibility changes of NFKC.
  return token
    .replace(/[\uff01-\uff5e]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfe_e0),
    )
    .replace(/\u3000/g, " ")
    .normalize("NFD");
}

export function spamMessageKey(message: ParsedMessage) {
  const rfcId = message.headers["message-id"]?.trim();
  return tokenHash(
    JSON.stringify([
      rfcId ? `rfc:${rfcId}` : `provider:${message.id}`,
      message.headers.from,
      message.headers.date,
      message.headers.subject,
      message.textHtml ?? message.textPlain ?? "",
    ]),
  );
}
