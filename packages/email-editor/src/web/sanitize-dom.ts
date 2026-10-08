import createDOMPurify, { type DOMPurify } from "dompurify";
import {
  EMAIL_BODY_ATTRIBUTES,
  EMAIL_BODY_REMOVED_TAGS,
  EMAIL_BODY_TAGS,
  isRemoteImageSource,
  sanitizeEmailBodyAttribute,
} from "../core/email-profile";

// Remote images are never loaded from the sender's host while composing; the
// editor swaps in a proxied URL and restores this value when reading HTML.
export const ORIGINAL_IMAGE_SOURCE_ATTRIBUTE = "data-original-src";

let purifier: DOMPurify | undefined;
const copiedOriginalSources = new WeakMap<Element, string>();

/**
 * Sanitizes HTML entering the editor (load, paste, drop, insert) with the same
 * profile the core applies before sending.
 */
export function sanitizeEmailHtmlToFragment(html: string): DocumentFragment {
  return getPurifier().sanitize(html, {
    ALLOWED_TAGS: [...EMAIL_BODY_TAGS],
    ALLOWED_ATTR: [...EMAIL_BODY_ATTRIBUTES],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|cid:|blob:|data:image\/|#)/iu,
    // DOMPurify checks every other attribute value against the URI pattern
    // too; the profile hook validates these values instead.
    ADD_URI_SAFE_ATTR: [...EMAIL_BODY_ATTRIBUTES].filter(
      (attribute) => attribute !== "href" && attribute !== "src",
    ),
    FORBID_CONTENTS: [...EMAIL_BODY_REMOVED_TAGS],
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: true,
  });
}

/**
 * Puts original image addresses back so proxied URLs never leave the editor,
 * whether through the value, the clipboard or a drag.
 */
export function restoreOriginalImageSources(html: string) {
  // DOMParser documents are inert: nothing loads or runs while rewriting.
  const { body } = new DOMParser().parseFromString(html, "text/html");
  for (const image of body.querySelectorAll(
    `img[${ORIGINAL_IMAGE_SOURCE_ATTRIBUTE}]`,
  )) {
    const original = image.getAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE) ?? "";
    image.removeAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE);
    if (isRemoteImageSource(original)) image.setAttribute("src", original);
  }
  return body.innerHTML;
}

function getPurifier() {
  if (purifier) return purifier;
  // A private instance keeps these hooks away from other DOMPurify users.
  purifier = createDOMPurify(window);
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    // Editor HTML copied, cut or dragged within the composer still carries
    // the original address next to the proxied one.
    if (
      data.attrName === ORIGINAL_IMAGE_SOURCE_ATTRIBUTE &&
      node.nodeName === "IMG" &&
      isRemoteImageSource(data.attrValue)
    ) {
      copiedOriginalSources.set(node, data.attrValue.trim());
    }
    const value = sanitizeEmailBodyAttribute(
      node.nodeName.toLowerCase(),
      data.attrName,
      data.attrValue,
    );
    if (value === null) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = value;
  });
  purifier.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName === "A") {
      if (node.hasAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      } else {
        node.removeAttribute("target");
        node.removeAttribute("rel");
      }
      return;
    }
    if (node.nodeName !== "IMG") return;
    const copiedSource = copiedOriginalSources.get(node);
    if (copiedSource) node.setAttribute("src", copiedSource);
    const source = node.getAttribute("src") ?? "";
    if (!source) {
      // Matches the send-time sanitizer, which drops images without a source.
      node.parentNode?.removeChild(node);
      return;
    }
    if (!isRemoteImageSource(source)) return;
    node.setAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE, source);
    node.removeAttribute("src");
  });
  return purifier;
}
