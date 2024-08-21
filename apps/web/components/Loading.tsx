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

export interface LoadingProps extends VariantProps<typeof loaderVariants> {}

export function Loading(props: LoadingProps) {
  return <Loader2Icon className={cn(loaderVariants(props))} />;
}

export function LoadingMiniSpinner(props: LoadingProps) {
  return <Loading {...props} size="xs" />;
}

export function ButtonLoader() {
  return <Loader2Icon className="mr-2 size-4" />;
}
