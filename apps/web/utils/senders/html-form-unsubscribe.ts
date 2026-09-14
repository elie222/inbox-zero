import * as cheerio from "cheerio";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";

const CONFIRMATION =
  /\b(successfully (opted[- ]out|unsubscribed)|subscription (has been )?(removed|cancelled|canceled|deleted|ended)|you(?:'ve| have) been (removed|unsubscribed)|you are now unsubscribed|no longer subscribed|opt-?out (?:is |was )?complete|you have been removed from)\b/i;

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
  // Success copy often sits unused inside inline scripts or templates, so
  // counting it would confirm an unsubscribe that never happened.
  $("script, style, noscript, template").remove();
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

  // A browser submits only the button the user activated. With several to pick
  // from we cannot tell "Unsubscribe" from "Keep subscription".
  if (
    $form.find(
      "button:not([type=button]):not([type=reset]), input[type=submit], input[type=image]",
    ).length > 1
  ) {
    return { kind: "unsupported" };
  }

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

    const value = $control.attr("value") || "";
    // A prefilled value is the sender's own token or address; only an empty
    // field is actually asking for the recipient.
    const asksForRecipient =
      type === "email" || (type !== "hidden" && /e-?mail/i.test(name));
    if (asksForRecipient && !value) {
      if (!recipientEmail) return { kind: "unsupported" };
      fields.push({ name, value: recipientEmail });
      continue;
    }
    fields.push({ name, value });
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
