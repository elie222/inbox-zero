import { Loader2Icon } from "lucide-react";

export function Loading() {
  return (
    <div className="p-8">
      <Loader2Icon className="mx-auto size-8 animate-spin" />
    </div>
  );
}

export function LoadingMiniSpinner() {
  return <Loader2Icon className="size-4 animate-spin" />;
}

export function ButtonLoader() {
  return <Loader2Icon className="mr-2 size-4 animate-spin" />;
}
