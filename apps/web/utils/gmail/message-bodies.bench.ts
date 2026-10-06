/**
 * Not a CI test. Run with:
 *   pnpm exec tsx utils/gmail/message-bodies.bench.ts
 */
import { performance } from "node:perf_hooks";
import "@/__tests__/test-env";
import { parseMessage } from "./message";
import type { MessageWithPayload } from "@/utils/types";

const shelf = "Hello, I would like to order the same shelf again.";
const signature = "Sent from my iPhone";

function time(label: string, rounds: number, run: () => void) {
  run();
  const start = performance.now();
  for (let i = 0; i < rounds; i++) run();
  const ms = (performance.now() - start) / rounds;
  process.stdout.write(`${label}: ${ms.toFixed(2)} ms\n`);
}

function textPart(mimeType: "text/plain" | "text/html", text: string) {
  return {
    mimeType,
    headers: [{ name: "Content-Type", value: `${mimeType}; charset=utf-8` }],
    body: { data: Buffer.from(text).toString("base64url"), size: text.length },
  };
}

function alternative(
  plain: string,
  html: string,
  snippet: string,
): MessageWithPayload {
  return {
    id: "message",
    threadId: "thread",
    snippet,
    payload: {
      mimeType: "multipart/alternative",
      headers: [{ name: "Content-Type", value: "multipart/alternative" }],
      parts: [textPart("text/plain", plain), textPart("text/html", html)],
    },
  };
}

function newsletter() {
  const paragraph = `<p>${"The shelf is ready to ship this week. ".repeat(12)}</p>\n`;
  let html = "<html><body>";
  while (html.length < 100_000) html += paragraph;
  html += "</body></html>";
  const plain = "The shelf is ready to ship this week. ".repeat(
    Math.ceil(html.length / 80),
  );
  return alternative(
    plain.slice(0, 20_000),
    html,
    "The shelf is ready to ship",
  );
}

function appleReply() {
  return alternative(
    `${shelf}\n\n${signature}\n`,
    `<html><body>${signature}</body></html>`,
    shelf,
  );
}

function adversarial() {
  const html = "<a".repeat(500_000);
  const plain = `${"y".repeat(html.length)}\n${signature}`;
  return alternative(plain, html, "y");
}

const cases = [
  ["100 KB newsletter", newsletter()],
  ["Apple Mail reply", appleReply()],
  ["1 MB unclosed tags", adversarial()],
] as const;

for (const [label, message] of cases) {
  const rounds = label.startsWith("1 MB") ? 3 : 20;
  time(label, rounds, () => {
    parseMessage(message);
  });
}
