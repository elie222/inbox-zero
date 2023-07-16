"use client";

import { useEffect, useState } from "react";
import { CreditCard, Settings, User } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ArchiveResponse,
  ArchiveBody,
} from "@/app/api/google/threads/archive/controller";
import { postRequest } from "@/utils/api";

export function CommandDialogDemo(props: { selected?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && e.metaKey) {
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!props.selected) return null;

  return (
    <>
      {/* <p className="text-muted-foreground text-sm">
        Press{" "}
        <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </p> */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              onSelect={() => {
                postRequest<ArchiveResponse, ArchiveBody>(
                  "/api/google/threads/archive",
                  { id: props.selected! }
                );
                setOpen(false);
              }}
            >
              <User className="mr-2 h-4 w-4" />
              <span>Archive</span>
              <CommandShortcut>A</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                // open in gmail
                window.open(
                  `https://mail.google.com/mail/u/0/#inbox/${props.selected!}`,
                  "_blank"
                );
                setOpen(false);
              }}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Open</span>
              <CommandShortcut>O</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Label</span>
              <CommandShortcut>L</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
