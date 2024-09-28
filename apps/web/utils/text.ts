import type { PortableTextBlock } from "@portabletext/react";
import type { PortableTextSpan } from "sanity";

export const slugify = (text: string) => {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
};

export const extractTextFromPortableTextBlock = (
  block: PortableTextBlock,
): string => {
  return block.children
    .filter(
      (child): child is PortableTextSpan =>
        typeof child === "object" && "_type" in child && "text" in child,
    )
    .map((child) => child.text)
    .join("");
};
