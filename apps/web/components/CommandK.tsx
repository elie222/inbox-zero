"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { navigation } from "@/components/SideNav";

export function CommandK() {
  const [open, setOpen] = React.useState(false);

  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        commandProps={{
          onKeyDown: (e) => {
            // allow closing modal
            if (e.key !== "Escape") {
              // stop propagation to prevent keyboard shortcuts from firing on the page
              e.stopPropagation();
            }
          },
        }}
      >
        <CommandInput placeholder="Type a command..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navigation.map((option) => (
              <CommandItem
                key={option.name}
                onSelect={() => {
                  router.push(option.href);
                  setOpen(false);
                }}
              >
                <option.icon className="mr-2 h-4 w-4" />
                <span>{option.name}</span>
                {/* <CommandShortcut>⌘P</CommandShortcut> */}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
