"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, PenLineIcon } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useNavigation } from "@/components/SideNav";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { refetchEmailListAtom, selectedEmailAtom } from "@/store/email";
import { archiveEmails } from "@/store/archive-queue";

export function CommandK() {
  const [open, setOpen] = React.useState(false);

  const router = useRouter();

  const [selectedEmail, setSelectedEmail] = useAtom(selectedEmailAtom);
  const refreshEmailList = useAtomValue(refetchEmailListAtom);

  const { onOpen: onOpenComposeModal } = useComposeModal();

  const onArchive = React.useCallback(() => {
    if (selectedEmail) {
      const threadIds = [selectedEmail];
      archiveEmails(threadIds, undefined, () => {
        return refreshEmailList?.refetch({ removedThreadIds: threadIds });
      });
      setSelectedEmail(undefined);
    }
  }, [refreshEmailList, selectedEmail, setSelectedEmail]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      } else if (
        (e.key === "e" || e.key === "E") &&
        !(e.metaKey || e.ctrlKey)
      ) {
        // only archive if the focus is on the body, to prevent when typing in an input
        if (document?.activeElement?.tagName === "BODY") {
          e.preventDefault();
          onArchive();
        }
      } else if (
        (e.key === "c" || e.key === "C") &&
        !(e.metaKey || e.ctrlKey)
      ) {
        // only open compose if the focus is on the body, to prevent when typing in an input
        if (document?.activeElement?.tagName === "BODY") {
          e.preventDefault();
          onOpenComposeModal();
        }
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [onArchive, onOpenComposeModal]);

  const navigation = useNavigation();

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
          <CommandGroup heading="Actions">
            {selectedEmail && (
              <CommandItem
                onSelect={() => {
                  onArchive();
                  setOpen(false);
                }}
              >
                <ArchiveIcon className="mr-2 h-4 w-4" />
                <span>Archive</span>
                <CommandShortcut>E</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem
              onSelect={() => {
                setOpen(false);
                onOpenComposeModal();
              }}
            >
              <PenLineIcon className="mr-2 h-4 w-4" />
              <span>Compose</span>
              <CommandShortcut>C</CommandShortcut>
            </CommandItem>
          </CommandGroup>
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
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
