"use client";

import { cn } from "@/utils/index";
import {
  Children,
  createElement,
  isValidElement,
  memo,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from "react";
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
const assistantBlockTagNames = new Set(Object.keys(allowedTags));
const components = {
  p: AssistantParagraph,
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
      typeof children === "string"
        ? normalizeAssistantTagMarkup(children)
        : children,
    ),
);

AssistantInlineEmailResponse.displayName = "AssistantInlineEmailResponse";

const tagAlternation = Object.keys(allowedTags).join("|");
const encodedDoubleQuotePattern = "(?:&quot;|&#34;|&#x22;)";
const encodedSingleQuotePattern = "(?:&apos;|&#39;|&#x27;)";
const encodedQuotedValuePattern =
  `(?:${encodedDoubleQuotePattern}(?:(?!${encodedDoubleQuotePattern})[\\s\\S])*${encodedDoubleQuotePattern}` +
  `|${encodedSingleQuotePattern}(?:(?!${encodedSingleQuotePattern})[\\s\\S])*${encodedSingleQuotePattern})`;
const quotedValuePattern = `(?:"[^"]*"|'[^']*'|[“”][^“”]*[“”]|[‘’][^‘’]*[‘’])`;
const encodedUnquotedCharacterPattern = `(?!(?:&gt;|${encodedDoubleQuotePattern}|${encodedSingleQuotePattern}|["'“”‘’]))[\\s\\S]`;

// Models sometimes escape the structured tags they were asked to emit, which
// would otherwise surface raw markup text to the user.
const entityEscapedTagPattern = new RegExp(
  `&lt;(/?(?:${tagAlternation})(?=[\\s/>])(?:${encodedQuotedValuePattern}|${quotedValuePattern}|${encodedUnquotedCharacterPattern})*)&gt;`,
  "gi",
);
const backslashEscapedTagPattern = new RegExp(
  `\\\\(</?(?:${tagAlternation})(?=[\\s/>]))`,
  "gi",
);
// Quote-aware so attribute values may contain ">".
const assistantTagPattern = new RegExp(
  `</?(?:${tagAlternation})(?=[\\s/>])(?:${quotedValuePattern}|[^>"'“”‘’])*>`,
  "gi",
);
const smartDoubleQuotedAttributePattern = /=\s*[“”]([^“”]*)[“”]/g;
const smartSingleQuotedAttributePattern = /=\s*[‘’]([^‘’]*)[‘’]/g;
const tagWhitespacePattern = /("[^"]*"|'[^']*')|\s+/g;
const selfClosingTagPattern = new RegExp(
  `<(${tagAlternation})(?=[\\s/>])((?:${quotedValuePattern}|[^>"'“”‘’])*?)\\s*/>`,
  "gi",
);

export function normalizeAssistantTagMarkup(content: string) {
  return content
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
    .replace(
      tagWhitespacePattern,
      (_match, quotedAttribute: string | undefined) => quotedAttribute ?? " ",
    );
}

function decodeTagEntities(tag: string) {
  return tag
    .replace(/&(?:quot|#34|#x22);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&amp;/gi, "&");
}

function AssistantParagraph({
  children,
  node: _node,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children?: ReactNode;
  node?: unknown;
}) {
  const meaningfulChildren = Children.toArray(children).filter(
    (child) => child !== "",
  );

  if (
    meaningfulChildren.length === 1 &&
    shouldUnwrapParagraphChild(meaningfulChildren[0])
  ) {
    return <>{children}</>;
  }

  return <p {...props}>{children}</p>;
}

function shouldUnwrapParagraphChild(child: ReactNode) {
  if (!isValidElement(child)) return false;

  const childProps = child.props as {
    node?: { tagName?: string };
    "data-block"?: string;
  };
  const tagName = childProps.node?.tagName?.toLowerCase();

  if (tagName && assistantBlockTagNames.has(tagName)) return true;
  if (tagName === "img") return true;

  return tagName === "code" && "data-block" in childProps;
}
