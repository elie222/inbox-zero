import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/utils";

const kbdVariants = cva(
  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border px-1 font-mono text-[10px] font-medium leading-none",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-muted-foreground",
        // Sits on a coloured/gradient surface, where a token background would
        // read as a hole rather than a key
        onColor: "border-white/30 bg-white/20 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Kbd({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLElement> & VariantProps<typeof kbdVariants>) {
  return <kbd className={cn(kbdVariants({ variant, className }))} {...props} />;
}
