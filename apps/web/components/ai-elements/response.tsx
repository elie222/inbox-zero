"use client";

import { cn } from "@/utils/index";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import { InlineEmailCard } from "@/components/assistant-chat/inline-email-card";

type ResponseProps = ComponentProps<typeof Streamdown>;

const emailAllowedTags = { email: ["id", "action"] };
const emailComponents = { email: InlineEmailCard };
const emailLiteralContent = ["email"];

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_a]:!text-inherit [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80",
        className,
      )}
      allowedTags={emailAllowedTags}
      components={emailComponents}
      literalTagContent={emailLiteralContent}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
