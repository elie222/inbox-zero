"use client";

import { cn } from "@/utils/index";
import { createElement, memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";
import {
  InlineEmailCard,
  InlineEmailDetail,
  InlineEmailList,
} from "@/components/assistant-chat/inline-email-card";
import {
  InlineRuleSuggestionCard,
  InlineRuleSuggestions,
} from "@/components/assistant-chat/inline-rule-suggestion-card";

type AssistantInlineEmailResponseProps = ComponentProps<typeof Streamdown>;

const allowedTags = {
  emails: [],
  email: ["id", "threadid", "index"],
  "email-detail": ["id", "threadid"],
  "rule-suggestions": [],
  "rule-suggestion": [
    "name",
    "when",
    "do",
    "label",
    "archive",
    "notify",
    "draft",
    "markread",
  ],
};
const components = {
  emails: InlineEmailList,
  email: InlineEmailCard,
  "email-detail": InlineEmailDetail,
  "rule-suggestions": InlineRuleSuggestions,
  "rule-suggestion": InlineRuleSuggestionCard,
};
const literalTagContent = ["email", "email-detail", "rule-suggestion"];

export const AssistantInlineEmailResponse = memo(
  ({ className, children, ...props }: AssistantInlineEmailResponseProps) =>
    createElement(
      Streamdown,
      {
        className: cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          "[&_[data-streamdown='heading-1']]:!mt-8",
          "[&_[data-streamdown='heading-2']]:!mt-8",
          "[&_[data-streamdown='heading-3']]:!mt-7",
          "[&_a]:!text-inherit [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80",
          className,
        ),
        allowedTags,
        components,
        literalTagContent,
        normalizeHtmlIndentation: true,
        ...props,
      },
      normalizeAssistantTags(children),
    ),
);

AssistantInlineEmailResponse.displayName = "AssistantInlineEmailResponse";

const tagAlternation = Object.keys(allowedTags).join("|");

// Models sometimes escape the structured tags they were asked to emit, which
// would otherwise surface raw markup text to the user.
const entityEscapedTagPattern = new RegExp(
  `&lt;(/?(?:${tagAlternation})(?:(?!&[lg]t;)[^<>])*)&gt;`,
  "gi",
);
const backslashEscapedTagPattern = new RegExp(
  `\\\\(</?(?:${tagAlternation})(?=[\\s/>]))`,
  "gi",
);
// Quote-aware so attribute values may contain ">".
const assistantTagPattern = new RegExp(
  `</?(?:${tagAlternation})(?=[\\s/>])(?:"[^"]*"|'[^']*'|[^>"'])*>`,
  "gi",
);
const smartDoubleQuotedAttributePattern = /=\s*[“”]([^“”]*)[“”]/g;
const smartSingleQuotedAttributePattern = /=\s*[‘’]([^‘’]*)[‘’]/g;
const selfClosingTagPattern = new RegExp(
  `<(${tagAlternation})(?![\\w-])((?:"[^"]*"|'[^']*'|[^>"'])*?)\\s*/>`,
  "gi",
);

/**
 * Normalizes assistant structured tags so intermittent model formatting
 * (escaped tags, blank lines inside tags, smart-quoted attributes,
 * self-closing tags) still renders as cards instead of raw markup.
 */
function normalizeAssistantTags(
  children: AssistantInlineEmailResponseProps["children"],
) {
  if (typeof children !== "string") return children;

  return children
    .replace(entityEscapedTagPattern, (_match, inner: string) =>
      decodeTagEntities(`<${inner}>`),
    )
    .replace(backslashEscapedTagPattern, "$1")
    .replace(assistantTagPattern, normalizeTag)
    .replace(selfClosingTagPattern, "<$1$2></$1>");
}

function normalizeTag(tag: string) {
  return tag
    .replace(smartDoubleQuotedAttributePattern, '="$1"')
    .replace(smartSingleQuotedAttributePattern, "='$1'")
    .replace(/\s+/g, " ");
}

function decodeTagEntities(tag: string) {
  return tag
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}
