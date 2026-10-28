"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronRightIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/utils";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

function CollapsibleHeading({
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof CollapsibleTrigger>, "asChild">) {
  return (
    <CollapsibleTrigger
      className={cn(
        "group flex w-full items-center gap-2 rounded-sm py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
      {children}
    </CollapsibleTrigger>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleHeading,
};
