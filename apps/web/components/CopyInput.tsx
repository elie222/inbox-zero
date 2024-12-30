"use client";

import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyInput({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex w-full flex-1 items-center gap-1">
      <input
        className="block w-full flex-1 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:ring-gray-200 sm:text-sm"
        name="copy-input"
        type="text"
        value={value}
        readOnly
        disabled
      />
      <Button
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
        }}
      >
        <CopyIcon className="mr-2 size-4" />
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
