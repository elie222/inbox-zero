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
import {
  assistantAllowedTags,
  normalizeAssistantTagMarkup,
} from "@/components/assistant-chat/assistant-tag-normalization";

type AssistantInlineEmailResponseProps = ComponentProps<typeof Streamdown>;

const assistantBlockTagNames = new Set(Object.keys(assistantAllowedTags));
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
          // The chat panel is narrow, so section headings stay small and let the content lead.
          "[&_[data-streamdown='heading-1']]:!mt-7 [&_[data-streamdown='heading-1']]:!text-lg [&_[data-streamdown='heading-1']]:!font-semibold",
          "[&_[data-streamdown='heading-2']]:!mt-7 [&_[data-streamdown='heading-2']]:!mb-2 [&_[data-streamdown='heading-2']]:!text-base [&_[data-streamdown='heading-2']]:!font-semibold",
          "[&_[data-streamdown='heading-3']]:!mt-6 [&_[data-streamdown='heading-3']]:!mb-1.5 [&_[data-streamdown='heading-3']]:!text-sm [&_[data-streamdown='heading-3']]:!font-semibold",
          // Keep each email card with its own text and space items apart, so an item reads as one unit.
          "[&_li:has([data-inline-email-card])]:!mb-4 [&_li:has([data-inline-email-card]):last-child]:!mb-0",
          "[&_a]:!text-inherit [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80",
          // Models backtick addresses and domains; monospace chips read as code and add visual noise.
          "[&_[data-streamdown='inline-code']]:bg-transparent [&_[data-streamdown='inline-code']]:p-0 [&_[data-streamdown='inline-code']]:font-sans [&_[data-streamdown='inline-code']]:font-medium [&_[data-streamdown='inline-code']]:text-[length:inherit]",
          className,
        ),
        allowedTags: assistantAllowedTags,
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
