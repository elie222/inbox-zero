import { type ForwardedRef, forwardRef } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/utils";

export type Color = VariantProps<typeof badgeVariants>["color"];

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      color: {
        gray: "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20",
        red: "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
        yellow:
          "bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-400 dark:ring-yellow-400/20",
        green:
          "bg-green-50 text-green-700 ring-green-600/10 dark:bg-green-400/10 dark:text-green-400 dark:ring-green-400/20",
        blue: "bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/20",
        indigo:
          "bg-indigo-50 text-indigo-700 ring-indigo-600/10 dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/20",
        purple:
          "bg-purple-50 text-purple-700 ring-purple-600/10 dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/20",
        pink: "bg-pink-50 text-pink-700 ring-pink-600/10 dark:bg-pink-400/10 dark:text-pink-400 dark:ring-pink-400/20",
      },
    },
  },
);

// https://www.radix-ui.com/docs/primitives/guides/composition
export const Badge = forwardRef(
  (
    props: { children: React.ReactNode; color: Color; className?: string },
    ref: ForwardedRef<HTMLSpanElement | null>,
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
  },
);
Badge.displayName = "Badge";
