"use client";

import { XIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Person = { memberId: string; name: string; image?: string | null };

export function ConversationParticipants({
  participants,
  currentMemberId,
  publisherMemberId,
  onRemove,
}: {
  participants: Person[];
  currentMemberId: string;
  publisherMemberId: string;
  onRemove?: (memberId: string) => void;
}) {
  const publisher = participants.find(
    (participant) => participant.memberId === publisherMemberId,
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Shared participants"
          className="inline-flex h-6 items-center gap-1.5 rounded-md border px-1.5 text-muted-foreground text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="-space-x-1 flex">
            {participants.slice(0, 3).map((participant) => (
              <PersonAvatar
                key={participant.memberId}
                person={participant}
                className="size-4 ring-1 ring-background"
              />
            ))}
          </span>
          Shared
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <p className="px-3 pt-3 pb-1 text-muted-foreground text-xs">
          This conversation is shared with:
        </p>
        <ul className="px-1 pb-1">
          {participants.map((participant) => (
            <li
              key={participant.memberId}
              className="flex h-8 items-center gap-2 rounded-sm px-2 text-sm"
            >
              <PersonAvatar person={participant} className="size-5" />
              <span className="min-w-0 flex-1 truncate">
                {participant.name}
                {participant.memberId === currentMemberId && (
                  <span className="text-muted-foreground"> (you)</span>
                )}
              </span>
              {onRemove && participant.memberId !== currentMemberId && (
                <button
                  type="button"
                  aria-label={`Remove ${participant.name}`}
                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onRemove(participant.memberId)}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t px-3 py-2 text-muted-foreground text-xs">
          {publisherMemberId === currentMemberId
            ? "Conversation shared by you"
            : `Conversation shared by ${publisher?.name ?? "a teammate"}`}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function PersonAvatar({
  person,
  className,
}: {
  person: Pick<Person, "name" | "image">;
  className: string;
}) {
  return (
    <Avatar className={className}>
      <AvatarImage src={person.image ?? undefined} alt="" />
      <AvatarFallback className="text-[10px]">
        {person.name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
