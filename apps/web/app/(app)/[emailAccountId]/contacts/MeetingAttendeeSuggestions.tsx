"use client";

import { formatDistanceToNow } from "date-fns";
import { EyeOffIcon, PlusIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import useSWR from "swr";
import type { MeetingAttendeesResponse } from "@/app/api/contacts/meeting-attendees/route";
import { LoadingContent } from "@/components/LoadingContent";
import { SearchBar } from "@/components/SearchBar";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { setContactIgnoredAction } from "@/utils/actions/contact";
import { getActionErrorMessage } from "@/utils/error";

type Attendee = MeetingAttendeesResponse[number];

export function MeetingAttendeeSuggestions({
  onPick,
}: {
  // Fills the add form with this person so their details can be reviewed
  // before saving, same as a scanned card
  onPick: (attendee: Attendee) => void;
}) {
  const { emailAccountId } = useAccount();
  const [search, setSearch] = useState("");
  // Ignored rows disappear immediately; the server call follows
  const [dismissed, setDismissed] = useState<string[]>([]);

  const { data, isLoading, error } = useSWR<MeetingAttendeesResponse>(
    "/api/contacts/meeting-attendees",
  );

  const ignore = useAction(setContactIgnoredAction.bind(null, emailAccountId), {
    onError: (actionError) => {
      toastError({ description: getActionErrorMessage(actionError.error) });
    },
  });

  const term = search.trim().toLowerCase();
  const attendees = (data ?? [])
    .filter((attendee) => !dismissed.includes(attendee.email))
    .filter(
      (attendee) =>
        !term ||
        attendee.email.includes(term) ||
        attendee.name?.toLowerCase().includes(term) ||
        attendee.lastMeetingTitle.toLowerCase().includes(term),
    );

  return (
    <div className="space-y-3">
      <SearchBar
        onSearch={setSearch}
        placeholder="Search people from your meetings..."
      />

      <LoadingContent loading={isLoading} error={error}>
        {data && data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No new people on your recent invites. Connect a calendar in Settings
            if you expected to see some.
          </p>
        )}

        {data && data.length > 0 && attendees.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No matches.
          </p>
        )}

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {attendees.map((attendee) => (
            <div
              key={attendee.email}
              className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {attendee.name || attendee.email}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {[
                    attendee.name ? attendee.email : null,
                    `${attendee.meetingCount} ${attendee.meetingCount === 1 ? "meeting" : "meetings"}`,
                    formatDistanceToNow(new Date(attendee.lastMetAt), {
                      addSuffix: true,
                    }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                title="Never suggest this person"
                onClick={() => {
                  setDismissed((current) => [...current, attendee.email]);
                  ignore.execute({ email: attendee.email, ignored: true });
                  toastSuccess({
                    description: `${attendee.name || attendee.email} won't be suggested again`,
                  });
                }}
              >
                <EyeOffIcon className="size-3.5" />
              </Button>
              <Button size="sm" onClick={() => onPick(attendee)}>
                <PlusIcon className="mr-1.5 size-3.5" />
                Add
              </Button>
            </div>
          ))}
        </div>
      </LoadingContent>
    </div>
  );
}
