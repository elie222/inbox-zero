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
import {
  LightbulbIcon,
  ArrowLeftIcon,
  PlusIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { personas } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { convertLabelsToDisplay } from "@/utils/mention";
import { Tooltip } from "@/components/Tooltip";
import { ButtonList } from "@/components/ButtonList";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { cn } from "@/utils";

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
  const [selectedExamples, setSelectedExamples] = useState<number[]>([]);

  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const handleExampleToggle = (index: number) => {
    setSelectedExamples((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  const handleAddSelected = () => {
    if (!selectedPersona || selectedExamples.length === 0) return;

    const persona = personas[selectedPersona as keyof typeof personas];

    if (selectedExamples.length === 1) {
      // Single selection - use the example directly
      const selectedExample = persona.promptArray[selectedExamples[0]];
      setInput(selectedExample);
    } else {
      // Multiple selections - format as "add the following rules:"
      const selectedRules = selectedExamples.map(
        (index) => persona.promptArray[index],
      );
      const formattedPrompt = `Add the following rules:\n${selectedRules.map((rule) => `- ${rule}`).join("\n")}`;
      setInput(formattedPrompt);
    }

    setIsOpen(false);
    setSelectedExamples([]);
  };

  const [selectedPersona, setSelectedPersona] = useQueryState(
    "persona",
    parseAsStringEnum(Object.keys(personas)),
  );

  const handleBackToPersonas = () => {
    setSelectedPersona(null);
    setSelectedExamples([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : (
        <Tooltip content="Choose from examples">
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <LightbulbIcon className="size-5" />
              <span className="sr-only">Show Examples</span>
            </Button>
          </DialogTrigger>
        </Tooltip>
      )}
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {selectedPersona && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackToPersonas}
                className="h-8 w-8"
              >
                <ArrowLeftIcon className="size-4" />
                <span className="sr-only">Back to personas</span>
              </Button>
            )}
            <DialogTitle>
              {selectedPersona ? "Choose examples" : "Choose persona"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {selectedPersona ? (
          <div className="flex min-h-0 flex-col space-y-4">
            <ScrollArea className="max-h-[50vh] flex-1">
              <div className="space-y-3 pr-4">
                {personas[
                  selectedPersona as keyof typeof personas
                ].promptArray.map((example, index) => {
                  const isSelected = selectedExamples.includes(index);
                  return (
                    <Button
                      key={index}
                      variant="outline"
                      className={cn(
                        "relative h-auto min-h-[2.5rem] w-full justify-start text-wrap px-4 py-3 text-left text-sm leading-relaxed",
                        isSelected &&
                          "border-green-500 bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-950/30",
                      )}
                      onClick={() => handleExampleToggle(index)}
                    >
                      <div className="flex w-full items-start gap-3">
                        {isSelected && (
                          <div className="mt-0.5 flex-shrink-0">
                            <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400" />
                          </div>
                        )}
                        <span className="flex-1 whitespace-pre-wrap">
                          {convertLabelsToDisplay(example)}
                        </span>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>

            {selectedExamples.length > 0 && (
              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleAddSelected}
                  className="gap-2"
                  variant="default"
                >
                  <PlusIcon className="size-4" />
                  Add Selected ({selectedExamples.length})
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ButtonList
            items={Object.entries(personas).map(([id, persona]) => ({
              id,
              name: persona.label,
            }))}
            onSelect={(id) => setSelectedPersona(id as keyof typeof personas)}
            emptyMessage=""
            columns={3}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
