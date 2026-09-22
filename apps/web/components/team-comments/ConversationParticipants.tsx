"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ConversationParticipants({
  participants,
}: {
  participants: Array<{ memberId: string; name: string; image: string | null }>;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Conversation audience"
      role="group"
    >
      <span className="text-muted-foreground text-xs">Visible to</span>
      {participants.map((participant) => (
        <span
          className="inline-flex items-center gap-1 text-xs"
          key={participant.memberId}
        >
          <Avatar className="size-5">
            <AvatarImage src={participant.image ?? undefined} alt="" />
            <AvatarFallback>
              {participant.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {participant.name}
        </span>
      ))}
    </div>
  );
}
