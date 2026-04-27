"use client";

import { cn } from "@/utils/index";
import { createElement, type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) =>
    createElement(Streamdown, {
      className: cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_[data-streamdown='heading-1']]:!mt-8",
        "[&_[data-streamdown='heading-2']]:!mt-8",
        "[&_[data-streamdown='heading-3']]:!mt-7",
        "[&_a]:!text-inherit [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80",
        className,
      ),
      normalizeHtmlIndentation: true,
      ...props,
    }),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
