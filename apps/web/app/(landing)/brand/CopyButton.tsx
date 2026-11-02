"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label,
  iconOnly,
}: {
  value: string;
  label: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <>
      <Button
        type="button"
        variant={iconOnly ? "ghost" : "outline"}
        size={iconOnly ? "icon" : "sm"}
        aria-label={iconOnly ? label : undefined}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toastError({ description: "Couldn't copy to the clipboard" });
          }
        }}
      >
        <Icon className={iconOnly ? "size-4" : "mr-2 size-4"} />
        {!iconOnly && (copied ? "Copied" : label)}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
