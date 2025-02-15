import { cn } from "@/utils";
import { type VariantProps, cva } from "class-variance-authority";
import { forwardRef } from "react";

const tagVariants = cva(
  "truncate rounded border-2 border-white px-2 py-0.5 text-center text-sm font-semibold shadow",
  {
    variants: {
      variant: {
        green: "bg-green-200 text-green-900",
        red: "bg-red-200 text-red-900",
        white: "bg-background text-primary",
      },
    },
  },
);

export interface TagProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof tagVariants> {
  asChild?: boolean;
  customColors?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
}

export const Tag = forwardRef<HTMLDivElement, TagProps>(
  ({ variant = "green", customColors, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        {...props}
        className={cn(tagVariants({ variant, className }))}
        style={{
          color: customColors?.textColor ?? undefined,
          backgroundColor: customColors?.backgroundColor ?? undefined,
        }}
      />
    );
  },
);
Tag.displayName = "Tag";
