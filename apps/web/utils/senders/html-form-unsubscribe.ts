import * as cheerio from "cheerio";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";

const CONFIRMATION =
  /\b(unsubscribed|successfully (opted[- ]out|unsubscribed)|subscription (has been )?(removed|cancelled|canceled|deleted|ended)|you(?:'ve| have) been (removed|unsubscribed)|no longer (?:receive|receiving|subscribed)|opt-?out (?:is |was )?complete|you have been removed from)\b/i;

const ALLOWED_INPUT_TYPES = new Set([
  "hidden",
  "email",
  "text",
  "submit",
  "button",
  "image",
]);

export type SimpleUnsubscribeForm = {
  method: "GET" | "POST";
  actionUrl: string;
  fields: Array<{ name: string; value: string }>;
};

export function isUnsubscribeAcknowledged(text: string) {
  return CONFIRMATION.test(text);
}

export function inspectUnsubscribeHtml({
  html,
  pageUrl,
  recipientEmail,
}: {
  html: string;
  pageUrl: string;
  recipientEmail?: string;
}):
  | { kind: "confirmed" }
  | { kind: "simple_form"; form: SimpleUnsubscribeForm }
  | { kind: "unsupported" } {
  const $ = cheerio.load(html);
  const pageText = $("body").text() || $.root().text();
  if (isUnsubscribeAcknowledged(pageText)) return { kind: "confirmed" };

  if (
    $(
      "input[type=password], input[type=file], iframe, .g-recaptcha, .h-captcha, .cf-turnstile",
    ).length
  ) {
    return { kind: "unsupported" };
  }

  const forms = $("form").toArray();
  if (forms.length !== 1) return { kind: "unsupported" };

  const $form = $(forms[0]);
  const method = ($form.attr("method") || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") return { kind: "unsupported" };

  let actionUrl: string;
  try {
    actionUrl = new URL($form.attr("action") || pageUrl, pageUrl).toString();
  } catch {
    return { kind: "unsupported" };
  }
  if (!isSafeExternalHttpUrl(actionUrl)) return { kind: "unsupported" };

  const fields: SimpleUnsubscribeForm["fields"] = [];
  const controls = $form.find("input, select, textarea, button");
  if (controls.length > 12) return { kind: "unsupported" };

  for (const element of controls.toArray()) {
    const $control = $(element);
    const tag = element.tagName.toLowerCase();
    if (tag === "select" || tag === "textarea") return { kind: "unsupported" };

    const type = ($control.attr("type") || "text").toLowerCase();
    if (tag === "input" && !ALLOWED_INPUT_TYPES.has(type)) {
      return { kind: "unsupported" };
    }

    const name = $control.attr("name");
    if (!name) continue;
    if (type === "email" || /e-?mail/i.test(name)) {
      if (!recipientEmail) return { kind: "unsupported" };
      fields.push({ name, value: recipientEmail });
      continue;
    }
    fields.push({ name, value: $control.attr("value") || "" });
  }

  return {
    kind: "simple_form",
    form: { method, actionUrl, fields },
  };
}

export function encodeFormBody(fields: SimpleUnsubscribeForm["fields"]) {
  return new URLSearchParams(
    fields.map(({ name, value }) => [name, value]),
  ).toString();
}
