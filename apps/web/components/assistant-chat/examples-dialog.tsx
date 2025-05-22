"use client";

import { useState } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LightbulbIcon } from "lucide-react";
import {
  examplePrompts,
  initialChatExamples,
} from "@/app/(app)/[emailAccountId]/automation/examples";

interface ExamplesDialogProps {
  setInput: UseChatHelpers["setInput"];
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ExamplesDialog({
  setInput,
  children,
  open,
  onOpenChange,
}: ExamplesDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    setIsOpen(false);
  };

  const allExamples = [
    ...initialChatExamples.map((example) => example.message),
    ...examplePrompts,
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon">
            <LightbulbIcon className="size-5" />
            <span className="sr-only">Show Examples</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email Automation Examples</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-3">
            {allExamples.map((example, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto min-h-[2.5rem] w-full justify-start text-wrap px-4 py-3 text-left text-sm leading-relaxed"
                onClick={() => handleExampleClick(example)}
              >
                <span className="whitespace-normal text-wrap break-words">
                  {example}
                </span>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
