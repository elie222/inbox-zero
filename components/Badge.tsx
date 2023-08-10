import { ForwardedRef, forwardRef } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/utils";

export type Color = VariantProps<typeof badgeVariants>["color"];

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      color: {
        gray: "bg-gray-50 text-gray-600 ring-gray-500/10",
        red: "bg-red-50 text-red-700 ring-red-600/10",
        yellow: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
        green: "bg-green-50 text-green-700 ring-green-600/10",
        blue: "bg-blue-50 text-blue-700 ring-blue-600/10",
        indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
        purple: "bg-purple-50 text-purple-700 ring-purple-600/10",
        pink: "bg-pink-50 text-pink-700 ring-pink-600/10",
      },
    },
  }
);

// https://www.radix-ui.com/docs/primitives/guides/composition
export const Badge = forwardRef(
  (
    props: { children: React.ReactNode; color: Color; className?: string },
    ref: ForwardedRef<HTMLSpanElement | null>
  ) => {
    const { color, className, ...rest } = props;

    return (
      <span
        ref={ref}
        {...rest}
        className={cn(badgeVariants({ color, className }))}
      >
        {props.children}
      </span>
    );
  }
);
Badge.displayName = "Badge";
