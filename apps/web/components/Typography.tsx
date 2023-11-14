import React from "react";
import { cn } from "@/utils";

const PageHeading = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "font-cal text-2xl leading-7 text-gray-900 sm:truncate sm:text-3xl",
      className
    )}
    {...props}
  />
));
PageHeading.displayName = "PageHeading";

const SectionHeader = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("font-cal text-base leading-7", className)}
    {...props}
  />
));
SectionHeader.displayName = "SectionHeader";

const SectionDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("mt-1 text-sm leading-6 text-gray-700", className)}
    {...props}
  />
));
SectionDescription.displayName = "SectionDescription";

const MessageText = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-gray-700", className)} {...props} />
));
MessageText.displayName = "MessageText";

const TypographyP = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("leading-7", className)} {...props} />
));
TypographyP.displayName = "TypographyP";

export {
  PageHeading,
  SectionHeader,
  SectionDescription,
  MessageText,
  TypographyP,
};
