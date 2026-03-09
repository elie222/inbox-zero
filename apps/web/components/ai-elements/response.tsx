"use client";

import { cn } from "@/utils/index";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import {
  InlineEmailCard,
  InlineEmailList,
} from "@/components/assistant-chat/inline-email-card";

type ResponseProps = ComponentProps<typeof Streamdown>;

const customAllowedTags = { emails: [], email: ["id", "action"] };
const customComponents = { emails: InlineEmailList, email: InlineEmailCard };
const customLiteralContent = ["email"];

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_a]:!text-inherit [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80",
        className,
      )}
      allowedTags={customAllowedTags}
      components={customComponents}
      literalTagContent={customLiteralContent}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
