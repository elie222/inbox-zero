import React from "react";
import { cn } from "@/utils";

export function PageHeading(props: { children: React.ReactNode }) {
  return (
    <h2 className="font-cal text-2xl leading-7 text-gray-900 sm:truncate sm:text-3xl">
      {props.children}
    </h2>
  );
}

export function SectionHeader(props: { children: React.ReactNode }) {
  return <h2 className="font-cal text-base leading-7">{props.children}</h2>;
}

export function SectionDescription(props: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-sm leading-6 text-gray-700">{props.children}</p>
  );
}

const MessageText = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-gray-700", className)} {...props} />
));
MessageText.displayName = "MessageText";

export { MessageText };
