import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";
import {
  EMAIL_BODY_ATTRIBUTES,
  EMAIL_BODY_REMOVED_TAGS,
  EMAIL_BODY_TAGS,
  SIGNATURE_CONTAINER_ATTRIBUTE,
  SIGNATURE_CONTAINER_VALUE,
  sanitizeEmailBodyAttribute,
} from "./email-profile";

type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

/**
 * Reduces untrusted HTML to the email body profile while keeping provider
 * markup (tables, styled blocks, fonts) intact. Active content is removed with
 * its children; other unknown elements are unwrapped.
 */
export function sanitizeEmailBodyHtml(html: string) {
  const fragment = parseFragment(html);
  sanitizeChildren(fragment);
  return serialize(fragment);
}

/**
 * Wraps a signature in the single container the composer collapses and
 * removes as one unit, or returns null when nothing visible is left.
 */
export function prepareEmailBodySignatureHtml(html: string) {
  const fragment = parseFragment(html);
  sanitizeChildren(fragment);
  // Re-wrapping a saved signature must not nest containers or stack the
  // blank line that separates it from the reply.
  unwrapSignatureContainers(fragment);
  while (fragment.childNodes[0] && !isVisible(fragment.childNodes[0])) {
    fragment.childNodes.shift();
  }
  if (!hasVisibleContent(fragment)) return null;

  return `<div ${SIGNATURE_CONTAINER_ATTRIBUTE}="${SIGNATURE_CONTAINER_VALUE}"><div><br></div>${serialize(fragment)}</div>`;
}

function unwrapSignatureContainers(parent: ParentNode) {
  const children: ChildNode[] = [];
  for (const node of parent.childNodes) {
    if (!isElement(node)) {
      children.push(node);
      continue;
    }
    unwrapSignatureContainers(node);
    const isContainer = node.attrs.some(
      (attribute) => attribute.name === SIGNATURE_CONTAINER_ATTRIBUTE,
    );
    if (!isContainer) {
      children.push(node);
      continue;
    }
    for (const child of node.childNodes) {
      child.parentNode = parent;
      children.push(child);
    }
  }
  parent.childNodes = children;
}

function sanitizeChildren(parent: ParentNode) {
  const children: ChildNode[] = [];

  for (const node of parent.childNodes) {
    if (node.nodeName === "#comment") continue;
    if (!isElement(node)) {
      children.push(node);
      continue;
    }
    if (EMAIL_BODY_REMOVED_TAGS.has(node.tagName)) continue;

    sanitizeChildren(node);
    if (!EMAIL_BODY_TAGS.has(node.tagName)) {
      for (const child of node.childNodes) {
        child.parentNode = parent;
        children.push(child);
      }
      continue;
    }

    sanitizeAttributes(node);
    if (node.tagName === "img" && !hasAttribute(node, "src")) continue;
    children.push(node);
  }

  parent.childNodes = children;
}

function sanitizeAttributes(element: Element) {
  const attributes: Element["attrs"] = [];
  for (const attribute of element.attrs) {
    if (!EMAIL_BODY_ATTRIBUTES.has(attribute.name)) continue;
    const value = sanitizeEmailBodyAttribute(
      element.tagName,
      attribute.name,
      attribute.value,
    );
    if (value !== null) attributes.push({ name: attribute.name, value });
  }
  element.attrs = attributes;

  if (element.tagName !== "a") return;
  element.attrs = element.attrs.filter(
    (attribute) => attribute.name !== "target" && attribute.name !== "rel",
  );
  if (hasAttribute(element, "href")) {
    element.attrs.push(
      { name: "target", value: "_blank" },
      { name: "rel", value: "noopener noreferrer" },
    );
  }
}

function hasVisibleContent(parent: ParentNode): boolean {
  return parent.childNodes.some(isVisible);
}

function isVisible(node: ChildNode): boolean {
  if ("value" in node) return Boolean(node.value.trim());
  if (!isElement(node)) return false;
  if (node.tagName === "img" || node.tagName === "hr") return true;
  return hasVisibleContent(node);
}

function hasAttribute(element: Element, name: string) {
  return element.attrs.some((attribute) => attribute.name === name);
}

function isElement(node: ChildNode): node is Element {
  return "tagName" in node;
}
