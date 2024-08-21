import { Loader2Icon } from "lucide-react";
import type React from "react";
import { VariantProps, cva } from "class-variance-authority";
import { cn } from "@/utils";

const loaderVariants = cva("mx-auto animate-spin", {
  variants: {
    size: {
      xs: "size-4",
      sm: "size-8",
    },
  },
  defaultVariants: { size: "sm" },
});

export const Loading: React.FC<VariantProps<typeof loaderVariants>> = (
  props,
) => {
  return <Loader2Icon className={cn(loaderVariants(props))} />;
};

export function LoadingMiniSpinner(props: VariantProps<typeof loaderVariants>) {
  return <Loading {...props} size="xs" />;
}

export function ButtonLoader() {
  return <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />;
}
