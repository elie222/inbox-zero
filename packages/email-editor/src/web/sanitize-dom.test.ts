// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeEmailBodyHtml } from "../core/email-body";
import { expectInert } from "../core/sanitizer.test-utils";
import {
  GMAIL_DRAFT_FIXTURE,
  OUTLOOK_DRAFT_FIXTURE,
  RTL_EDITABLE_FIXTURE,
  SANITIZER_ATTACK_FIXTURES,
  SIGNATURE_FIXTURES,
} from "../fixtures/email-html";
import {
  ORIGINAL_IMAGE_SOURCE_ATTRIBUTE,
  restoreOriginalImageSources,
  sanitizeEmailHtmlToFragment,
} from "./sanitize-dom";

describe("sanitizeEmailHtmlToFragment", () => {
  it.each(
    SANITIZER_ATTACK_FIXTURES,
  )("removes active content from %s", (html) => {
    expectInert(toHtml(sanitizeEmailHtmlToFragment(html)));
  });

  it.each([
    ...Object.entries(SIGNATURE_FIXTURES),
    ["gmail draft", GMAIL_DRAFT_FIXTURE],
    ["outlook draft", OUTLOOK_DRAFT_FIXTURE],
    ["rtl", RTL_EDITABLE_FIXTURE],
  ])("agrees with the send-time sanitizer on the %s fixture", (_name, html) => {
    const fragment = sanitizeEmailHtmlToFragment(html);
    restoreOriginalSources(fragment);

    expect(normalize(toHtml(fragment))).toBe(
      normalize(sanitizeEmailBodyHtml(html)),
    );
  });

  it("never loads remote images directly while composing", () => {
    const fragment = sanitizeEmailHtmlToFragment(
      '<img src="https://assets.example.com/logo.png" alt="Logo"><img src="cid:a@example">',
    );
    const [remote, inline] = fragment.querySelectorAll("img");

    expect(remote.hasAttribute("src")).toBe(false);
    expect(remote.getAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE)).toBe(
      "https://assets.example.com/logo.png",
    );
    expect(inline.getAttribute("src")).toBe("cid:a@example");
  });

  it("keeps local previews and drops data images", () => {
    const html = toHtml(
      sanitizeEmailHtmlToFragment(
        '<img src="blob:https://app.example/1" data-content-id="a@example"><img src="data:image/png;base64,iVBORw0KGgo=">',
      ),
    );

    expect(html).toContain('src="blob:https://app.example/1"');
    expect(html).toContain('data-content-id="a@example"');
    expect(html).not.toContain("data:image");
  });

  it("recovers the original address from editor HTML copied within the composer", () => {
    const [image] = sanitizeEmailHtmlToFragment(
      `<img src="/api/image-proxy?u=signed" ${ORIGINAL_IMAGE_SOURCE_ATTRIBUTE}="https://assets.example.com/logo.png" alt="Logo">`,
    ).querySelectorAll("img");

    expect(image.hasAttribute("src")).toBe(false);
    expect(image.getAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE)).toBe(
      "https://assets.example.com/logo.png",
    );
  });

  it("restores original addresses for the clipboard and the sent value", () => {
    expect(
      restoreOriginalImageSources(
        `<img src="https://proxy.example/p" ${ORIGINAL_IMAGE_SOURCE_ATTRIBUTE}="https://assets.example.com/logo.png">`,
      ),
    ).toBe('<img src="https://assets.example.com/logo.png">');
  });

  it("never restores a non-web address as an image source", () => {
    expect(
      restoreOriginalImageSources(
        `<img src="https://proxy.example/p" ${ORIGINAL_IMAGE_SOURCE_ATTRIBUTE}="javascript:alert(1)">`,
      ),
    ).toBe('<img src="https://proxy.example/p">');
  });
});

function toHtml(fragment: DocumentFragment) {
  const container = document.createElement("div");
  container.append(fragment.cloneNode(true));
  return container.innerHTML;
}

function restoreOriginalSources(fragment: DocumentFragment) {
  for (const image of fragment.querySelectorAll(
    `img[${ORIGINAL_IMAGE_SOURCE_ATTRIBUTE}]`,
  )) {
    image.setAttribute(
      "src",
      image.getAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE) ?? "",
    );
    image.removeAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE);
  }
}

// Attribute order differs between the two DOM implementations.
function normalize(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll("*")) {
    const attributes = [...element.attributes]
      .map((attribute) => [attribute.name, attribute.value] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [name] of attributes) element.removeAttribute(name);
    for (const [name, value] of attributes) element.setAttribute(name, value);
  }
  return template.innerHTML;
}
