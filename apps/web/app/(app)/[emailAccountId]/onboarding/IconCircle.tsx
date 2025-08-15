import { cn } from "@/utils";
import { cva, type VariantProps } from "class-variance-authority";

const iconVariants = cva("relative flex items-center justify-center", {
  variants: {
    size: {
      sm: "h-8 w-8 min-w-8",
      md: "h-12 w-12 min-w-12",
      lg: "h-16 w-16 min-w-16",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const innerVariants = cva(
  "relative flex items-center justify-center rounded-full bg-white shadow-sm",
  {
    variants: {
      size: {
        sm: "h-6 w-6",
        md: "h-8 w-8",
        lg: "h-12 w-12",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export const textVariants = cva("font-semibold", {
  variants: {
    size: {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
    },
    color: {
      blue: "text-blue-600",
      purple: "text-purple-600",
      green: "text-green-600",
      yellow: "text-yellow-600",
      orange: "text-orange-600",
      red: "text-red-600",
      indigo: "text-indigo-600",
    },
  },
  defaultVariants: {
    size: "md",
    color: "blue",
  },
});
export type IconCircleColor = VariantProps<typeof textVariants>["color"];

const backgroundVariants = cva("absolute inset-0 rounded-full shadow-sm", {
  variants: {
    color: {
      blue: "bg-gradient-to-b from-blue-600/40 to-blue-600/5",
      purple: "bg-gradient-to-b from-purple-600/40 to-purple-600/5",
      green: "bg-gradient-to-b from-green-600/40 to-green-600/5",
      yellow: "bg-gradient-to-b from-yellow-600/40 to-yellow-600/5",
      orange: "bg-gradient-to-b from-orange-600/40 to-orange-600/5",
      red: "bg-gradient-to-b from-red-600/40 to-red-600/5",
      indigo: "bg-gradient-to-b from-indigo-600/40 to-indigo-600/5",
    },
  },
  defaultVariants: {
    color: "blue",
  },
});

export interface IconCircleProps
  extends VariantProps<typeof iconVariants>,
    VariantProps<typeof textVariants> {
  children?: React.ReactNode;
  className?: string;
  Icon?: React.ElementType;
}

export function IconCircle({
  children,
  size = "md",
  color = "blue",
  className,
  Icon,
}: IconCircleProps) {
  return (
    <div className={cn(iconVariants({ size }), className)}>
      <div className={backgroundVariants({ color })} />
      <div className={innerVariants({ size })}>
        <span className={textVariants({ size, color })}>
          {Icon ? <Icon className="size-4" /> : children}
        </span>
      </div>
    </div>
  );
}
