"use client";

import { useState } from "react";
import { HistoryIcon, Loader2, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChats } from "@/hooks/useChats";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import type { ChatType } from "@/generated/prisma/client";

export function NewChatButton({ onNewChat }: { onNewChat: () => void }) {
  return (
    <Tooltip content="Start a new conversation">
      <Button variant="ghost" size="icon" onClick={onNewChat}>
        <PlusIcon className="size-5" />
        <span className="sr-only">New Chat</span>
      </Button>
    </Tooltip>
  );
}

export function ChatHistoryDropdown({
  setChatId,
  type,
}: {
  setChatId: (chatId: string) => void;
  type?: ChatType;
}) {
  const [shouldLoadChats, setShouldLoadChats] = useState(false);
  const { data, error, isLoading, mutate } = useChats(shouldLoadChats, type);

  return (
    <DropdownMenu>
      <Tooltip content="View previous conversations">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onMouseEnter={() => setShouldLoadChats(true)}
            onClick={() => mutate()}
          >
            <HistoryIcon className="size-5" />
            <span className="sr-only">Chat History</span>
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={
            <DropdownMenuItem
              disabled
              className="flex items-center justify-center"
            >
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading chats...
            </DropdownMenuItem>
          }
          errorComponent={
            <DropdownMenuItem disabled>Error loading chats</DropdownMenuItem>
          }
        >
          {data && data.chats.length > 0 ? (
            data.chats.map((chatItem) => (
              <DropdownMenuItem
                key={chatItem.id}
                onSelect={() => setChatId(chatItem.id)}
              >
                {`Chat from ${new Date(chatItem.createdAt).toLocaleString()}`}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>
              No previous chats found
            </DropdownMenuItem>
          )}
        </LoadingContent>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
