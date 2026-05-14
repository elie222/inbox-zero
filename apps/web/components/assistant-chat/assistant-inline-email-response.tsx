"use client";

import { cn } from "@/utils/index";
import {
  Children,
  Fragment,
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
const tagAlternation = Object.keys(allowedTags).join("|");
const assistantTagPattern = new RegExp(
  `<\\/?(?:${tagAlternation})(?=[\\s>/])[^>]*>`,
  "gi",
);
const indentedAssistantTagLinePattern = new RegExp(
  `(^|\\n)[ \\t]+(?=<\\/?(?:${tagAlternation})(?=[\\s>/]))`,
  "gi",
);
const tagWhitespaceRunPattern = /\s*\n\s*/g;
const leftDoubleQuotePattern = /[“”]/g;
const leftSingleQuotePattern = /[‘’]/g;

export const AssistantInlineEmailResponse = memo(
  ({ className, children, ...props }: AssistantInlineEmailResponseProps) => {
    const normalizedChildren =
      typeof children === "string"
        ? normalizeAssistantInlineMarkup(children)
        : children;

    return createElement(
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
      normalizedChildren,
    );
  },
);

AssistantInlineEmailResponse.displayName = "AssistantInlineEmailResponse";

export function normalizeAssistantInlineMarkup(content: string) {
  return content
    .replace(indentedAssistantTagLinePattern, "$1")
    .replace(assistantTagPattern, (tag) =>
      tag
        .replace(tagWhitespaceRunPattern, " ")
        .replace(leftDoubleQuotePattern, '"')
        .replace(leftSingleQuotePattern, "'"),
    );
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
    return createElement(Fragment, null, children);
  }

  return createElement("p", props, children);
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
