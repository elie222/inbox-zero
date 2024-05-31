"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ExpandIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  TagIcon,
  TrashIcon,
  UserPlus,
} from "lucide-react";
import { type PostHog } from "posthog-js/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LabelsResponse } from "@/app/api/google/labels/route";
import { GetThreadsResponse } from "@/app/api/google/threads/basic/route";
import { archiveEmails, deleteEmails } from "@/providers/QueueProvider";
import { isDefined } from "@/utils/types";
import { getGmailSearchUrl } from "@/utils/url";
import { Row } from "@/app/(app)/bulk-unsubscribe/types";
import {
  GroupsSubMenu,
  LabelsSubMenu,
} from "@/app/(app)/bulk-unsubscribe/sub-menus";

export function MoreDropdown<T extends Row>({
  setOpenedNewsletter,
  item,
  userEmail,
  userGmailLabels,
  posthog,
}: {
  setOpenedNewsletter?: (row: T) => void;
  item: T;
  userEmail: string;
  userGmailLabels: LabelsResponse["labels"];
  posthog?: PostHog;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-haspopup="true" size="icon" variant="ghost">
          <MoreHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!!setOpenedNewsletter && (
          <DropdownMenuItem
            onClick={() => {
              setOpenedNewsletter(item);
              posthog?.capture("Clicked Expand Sender");
            }}
          >
            <ExpandIcon className="mr-2 h-4 w-4" />
            <span>View stats</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={getGmailSearchUrl(item.name, userEmail)} target="_blank">
            <ExternalLinkIcon className="mr-2 h-4 w-4" />
            <span>View in Gmail</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserPlus className="mr-2 h-4 w-4" />
            <span>Add sender to group</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <GroupsSubMenu sender={item.name} />
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <TagIcon className="mr-2 h-4 w-4" />
            <span>Label future emails</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <LabelsSubMenu sender={item.name} labels={userGmailLabels} />
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuItem
          onClick={() => {
            toast.promise(
              async () => {
                // 1. search gmail for messages from sender
                const res = await fetch(
                  `/api/google/threads/basic?from=${item.name}&labelId=INBOX`,
                );
                const data: GetThreadsResponse = await res.json();

                // 2. archive messages
                if (data?.length) {
                  archiveEmails(
                    data.map((t) => t.id).filter(isDefined),
                    () => {},
                  );
                }

                return data.length;
              },
              {
                loading: `Archiving all emails from ${item.name}`,
                success: (data) =>
                  data
                    ? `Archiving ${data} emails from ${item.name}...`
                    : `No emails to archive from ${item.name}`,
                error: `There was an error archiving the emails from ${item.name} :(`,
              },
            );
          }}
        >
          <ArchiveIcon className="mr-2 h-4 w-4" />
          <span>Archive all</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const yes = confirm(
              `Are you sure you want to delete all emails from ${item.name}?`,
            );
            if (!yes) return;

            toast.promise(
              async () => {
                // 1. search gmail for messages from sender
                const res = await fetch(
                  `/api/google/threads/basic?from=${item.name}`,
                );
                const data: GetThreadsResponse = await res.json();

                // 2. delete messages
                if (data?.length) {
                  deleteEmails(
                    data.map((t) => t.id).filter(isDefined),
                    () => {},
                  );
                }

                return data.length;
              },
              {
                loading: `Deleting all emails from ${item.name}`,
                success: (data) =>
                  data
                    ? `Deleting ${data} emails from ${item.name}...`
                    : `No emails to delete from ${item.name}`,
                error: `There was an error deleting the emails from ${item.name} :(`,
              },
            );
          }}
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          <span>Delete all</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
