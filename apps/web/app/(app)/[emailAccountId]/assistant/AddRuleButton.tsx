"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  LightbulbIcon,
  PenIcon,
  PlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { ExamplesDialog } from "@/components/assistant-chat/examples-dialog";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { useRules } from "@/hooks/useRules";
import { useChat } from "@/providers/ChatProvider";

export function AddRuleButton() {
  const { mutate } = useRules();
  const { setInput, setInputFocusRequested } = useChat();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const ruleDialog = useDialogState();
  const [examplesOpen, setExamplesOpen] = useState(false);

  const prefillChat = (text: string) => {
    setInput(text);
    setInputFocusRequested(true);

    const openChat = (openSidebars: string[]) =>
      openSidebars.includes("chat-sidebar")
        ? openSidebars
        : [...openSidebars, "chat-sidebar"];
    if (isMobile) setOpenMobile(openChat);
    else setOpen(openChat);
  };

  return (
    <>
      <div className="flex">
        <Button
          size="sm"
          Icon={PlusIcon}
          className="rounded-r-none"
          onClick={() => prefillChat("Add a rule: ")}
        >
          Add Rule
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="rounded-l-none border-l border-primary-foreground/20 px-2"
              aria-label="More ways to add a rule"
            >
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            // Focus belongs to the chat input or dialog opened from the menu.
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => ruleDialog.onOpen()}>
              <PenIcon className="mr-2 size-4" />
              Add rule manually
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setExamplesOpen(true)}>
              <LightbulbIcon className="mr-2 size-4" />
              Choose from examples
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ExamplesDialog
        open={examplesOpen}
        onOpenChange={setExamplesOpen}
        setInput={prefillChat}
      />

      <RuleDialog
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        onSuccess={() => {
          mutate();
          ruleDialog.onClose();
        }}
        editMode={false}
      />
    </>
  );
}
