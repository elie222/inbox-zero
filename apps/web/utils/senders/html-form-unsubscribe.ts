import * as cheerio from "cheerio";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";

// No "image": a browser submits those as name.x/name.y coordinates, which we
// cannot reproduce, so the form is left to the browser worker instead.
const ALLOWED_INPUT_TYPES = new Set([
  "hidden",
  "email",
  "text",
  "submit",
  "button",
]);

export type SimpleUnsubscribeForm = {
  method: "GET" | "POST";
  actionUrl: string;
  fields: Array<{ name: string; value: string }>;
};

export function inspectUnsubscribeHtml({
  html,
  pageUrl,
  recipientEmail,
}: {
  html: string;
  pageUrl: string;
  recipientEmail?: string;
}):
  | { kind: "simple_form"; pageText: string; form: SimpleUnsubscribeForm }
  | { kind: "unsupported"; pageText: string } {
  const $ = cheerio.load(html);
  // Success copy often sits unused inside inline scripts or templates, so
  // reading it would describe a page state the user never saw.
  $("script, style, noscript, template").remove();
  const pageText = $("body").text() || $.root().text();
  const unsupported = { kind: "unsupported", pageText } as const;

  if (
    $(
      "input[type=password], input[type=file], iframe, .g-recaptcha, .h-captcha, .cf-turnstile",
    ).length
  ) {
    return unsupported;
  }

  const forms = $("form").toArray();
  if (forms.length !== 1) return unsupported;

  const $form = $(forms[0]);
  const method = ($form.attr("method") || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") return unsupported;

  let actionUrl: string;
  try {
    actionUrl = new URL($form.attr("action") || pageUrl, pageUrl).toString();
  } catch {
    return unsupported;
  }
  if (!isSafeExternalHttpUrl(actionUrl)) return unsupported;

  const fields: SimpleUnsubscribeForm["fields"] = [];
  const controls = $form.find("input, select, textarea, button");
  if (controls.length > 12) return unsupported;

  // A browser submits only the button the user activated. With several to pick
  // from we cannot tell "Unsubscribe" from "Keep subscription".
  if (
    $form.find(
      "button:not([type=button]):not([type=reset]), input[type=submit], input[type=image]",
    ).length > 1
  ) {
    return unsupported;
  }

  for (const element of controls.toArray()) {
    const $control = $(element);
    const tag = element.tagName.toLowerCase();
    if (tag === "select" || tag === "textarea") return unsupported;

    const type = ($control.attr("type") || "text").toLowerCase();
    if (tag === "input" && !ALLOWED_INPUT_TYPES.has(type)) {
      return unsupported;
    }
    // A browser never submits a button it did not activate, so sending these
    // could hand the endpoint a "cancel" instead of the unsubscribe.
    if (type === "button" || type === "reset") continue;

    const name = $control.attr("name");
    if (!name) continue;

    const value = $control.attr("value") || "";
    // A prefilled value is the sender's own token or address; only an empty
    // field is actually asking for the recipient.
    const asksForRecipient =
      type === "email" || (type !== "hidden" && /e-?mail/i.test(name));
    if (asksForRecipient && !value) {
      if (!recipientEmail) return unsupported;
      fields.push({ name, value: recipientEmail });
      continue;
    }
    fields.push({ name, value });
  }

  return {
    kind: "simple_form",
    pageText,
    form: { method, actionUrl, fields },
  };
}

export function encodeFormBody(fields: SimpleUnsubscribeForm["fields"]) {
  return new URLSearchParams(
    fields.map(({ name, value }) => [name, value]),
  ).toString();
}
