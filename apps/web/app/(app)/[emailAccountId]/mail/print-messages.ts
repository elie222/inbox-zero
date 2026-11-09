import {
  IMAGE_PROXY_ORIGIN,
  prepareEmailImages,
  sanitizeEmailHtml,
} from "@/utils/email/prepare-html.client";
import { escapeHtml } from "@/utils/string";
import type { ParsedMessage } from "@/utils/types";

type PrintableMessage = Pick<
  ParsedMessage,
  "id" | "headers" | "textHtml" | "textPlain" | "attachments"
>;

let printFrame: HTMLIFrameElement | null = null;

/**
 * Prints the messages through a hidden frame so only the mail, not the app
 * around it, reaches the page. Scripts stay off in the frame; the sanitized
 * bodies have none, and the frame only needs to paint.
 */
export async function printMessages({
  subject,
  messages,
}: {
  subject: string;
  messages: PrintableMessage[];
}) {
  const bodies = await Promise.all(
    messages.map((message) =>
      message.textHtml
        ? prepareEmailImages({
            messageId: message.id,
            sourceHtml: sanitizeEmailHtml(message.textHtml),
          })
        : null,
    ),
  );

  // Safari returns from print() before its dialog closes, so the previous
  // frame is cleared on the next print rather than right after this one.
  printFrame?.remove();
  const frame = document.createElement("iframe");
  printFrame = frame;
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  frame.addEventListener(
    "load",
    () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    },
    { once: true },
  );
  frame.srcdoc = buildPrintDocument({
    subject,
    messages: messages.map((message, index) => ({
      ...message,
      html: bodies[index]?.html ?? null,
    })),
    // One message the proxy could not prepare keeps the whole printout from
    // loading images directly from senders.
    allowRemoteImages: bodies.every(
      (body) => body?.remoteImagesAllowed ?? true,
    ),
  });
  document.body.append(frame);
}

export function buildPrintDocument({
  subject,
  messages,
  allowRemoteImages = true,
}: {
  subject: string;
  messages: (PrintableMessage & { html: string | null })[];
  allowRemoteImages?: boolean;
}) {
  const sections = messages.map((message) => {
    const { from, to, cc, date } = message.headers;
    const attachments = (message.attachments ?? [])
      .map((attachment) => attachment.filename)
      .filter(Boolean);
    const body =
      message.html ??
      `<div style="white-space: pre-wrap">${escapeHtml(message.textPlain)}</div>`;

    return `<section class="message">
  <div class="meta">
    <div class="row"><strong>${escapeHtml(from)}</strong><span>${escapeHtml(formatPrintDate(date))}</span></div>
    ${to ? `<div>To: ${escapeHtml(to)}</div>` : ""}
    ${cc ? `<div>Cc: ${escapeHtml(cc)}</div>` : ""}
    ${attachments.length ? `<div>Attachments: ${attachments.map(escapeHtml).join(", ")}</div>` : ""}
  </div>
  <div class="body">${body}</div>
</section>`;
  });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: ${allowRemoteImages ? "https:" : ""} ${IMAGE_PROXY_ORIGIN ?? ""}; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(subject)}</title>
<style>
  @page { margin: 16mm; }
  body { margin: 0; color: #111; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow-wrap: anywhere; }
  h1 { margin: 0 0 16px; font-size: 20px; font-weight: 600; }
  .message { padding: 12px 0 16px; border-top: 1px solid #ddd; }
  .meta { margin-bottom: 12px; color: #555; font-size: 12px; }
  .meta strong { color: #111; font-size: 14px; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .body img { max-width: 100% !important; height: auto; }
  .body table { max-width: 100% !important; }
  img[src^="cid:" i] { display: none; }
</style>
</head>
<body>
<h1>${escapeHtml(subject)}</h1>
${sections.join("\n")}
</body>
</html>`;
}

function formatPrintDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
