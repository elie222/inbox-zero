import { saveBlob } from "@/utils/attachments/download";
import { fetchWithAccount } from "@/utils/fetch";

export async function fetchMessageSource({
  emailAccountId,
  messageId,
}: {
  emailAccountId: string;
  messageId: string;
}) {
  const response = await fetchWithAccount({
    url: `/api/messages/source?${new URLSearchParams({ messageId })}`,
    emailAccountId,
  });
  if (!response.ok) throw new Error("Unable to load the original message");
  return new Blob([await response.arrayBuffer()], { type: "message/rfc822" });
}

export function saveMessageSource(source: Blob, subject: string) {
  saveBlob(source, `${getMessageFileName(subject)}.eml`);
}

export function getMessageFileName(subject: string) {
  const name = subject
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are invalid in file names
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return name || "message";
}
