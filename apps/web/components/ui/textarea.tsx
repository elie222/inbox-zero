"use client";

import * as React from "react";
import TextareaAutosize from "react-textarea-autosize";

import { cn } from "@/utils";

const textareaStyles =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(textareaStyles, "min-h-[80px]", className)}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

const AutosizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<typeof TextareaAutosize>
>(({ className, ...props }, ref) => (
  <TextareaAutosize
    ref={ref}
    className={cn(textareaStyles, className)}
    {...props}
  />
));
AutosizeTextarea.displayName = "AutosizeTextarea";

export { Textarea, AutosizeTextarea };
