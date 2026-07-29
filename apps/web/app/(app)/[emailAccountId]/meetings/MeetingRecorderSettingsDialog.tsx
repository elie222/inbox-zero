"use client";

import { useAction } from "next-safe-action/hooks";
import { ListCard } from "@/components/ListCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import type { MeetingJoinRule } from "@/generated/prisma/enums";
import {
  useMeetingRecorderSettings,
  useMeetingRecorderUpcoming,
} from "@/hooks/useMeetingRecorder";
import { getActionErrorMessage } from "@/utils/error";
import { MEETING_BOT_DISPLAY_NAME } from "@/utils/meeting-recorder/bot-provider";
import { updateMeetingRecorderSettingsAction } from "@/utils/actions/meeting-recorder";
import type { UpdateMeetingRecorderSettingsBody } from "@/utils/actions/meeting-recorder.validation";
import { JoinRuleChooser } from "@/app/(app)/[emailAccountId]/meetings/JoinRuleChooser";

export function MeetingRecorderSettingsDialog({
  emailAccountId,
  open,
  onClose,
}: {
  emailAccountId: string;
  open: boolean;
  onClose: () => void;
}) {
  // Only mounted inside the page's `settings.enabled` branch, so the settings
  // are already loaded and SWR serves them from cache.
  const { data, mutate } = useMeetingRecorderSettings(emailAccountId);
  const { mutate: mutateUpcoming } = useMeetingRecorderUpcoming(emailAccountId);

  const { execute } = useAction(
    updateMeetingRecorderSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        mutate();
        mutateUpcoming();
      },
      onError: ({ error }) => {
        mutate();
        toastError({
          description: getActionErrorMessage(error, {
            prefix: "Failed to save settings",
          }),
        });
      },
    },
  );

  // Paint the change immediately. These controls stay on screen while the
  // action round-trips, so without this the radio and toggles look stuck.
  const save = (update: UpdateMeetingRecorderSettingsBody) => {
    if (data) mutate({ ...data, ...update }, { revalidate: false });
    execute(update);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notetaker settings</DialogTitle>
          <DialogDescription>
            {MEETING_BOT_DISPLAY_NAME} joins as a visible participant, so
            everyone in the call knows it is there.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-6">
            <div className="space-y-2">
              <ItemTitle>Which meetings to join</ItemTitle>
              <JoinRuleChooser
                value={data.joinRule}
                onChange={(joinRule: MeetingJoinRule) => save({ joinRule })}
              />
              <MutedText>
                You can still turn individual meetings on or off from the Up
                next list.
              </MutedText>
            </div>

            <ListCard>
              <Item>
                <ItemContent>
                  <ItemTitle>Email me the notes</ItemTitle>
                  <ItemDescription>
                    Send the summary to your inbox after each call
                  </ItemDescription>
                </ItemContent>
                <Toggle
                  name="recapEmailEnabled"
                  ariaLabel="Email me the notes"
                  enabled={data.recapEmailEnabled}
                  onChange={(recapEmailEnabled) => save({ recapEmailEnabled })}
                />
              </Item>

              <Item>
                <ItemContent>
                  <ItemTitle>Draft a follow-up email</ItemTitle>
                  <ItemDescription>
                    Leave a follow-up to the other attendees in your drafts.
                    Nothing is ever sent for you.
                  </ItemDescription>
                </ItemContent>
                <Toggle
                  name="followUpDraftEnabled"
                  ariaLabel="Draft a follow-up email"
                  enabled={data.followUpDraftEnabled}
                  onChange={(followUpDraftEnabled) =>
                    save({ followUpDraftEnabled })
                  }
                />
              </Item>
            </ListCard>

            <div className="flex items-center justify-between gap-4">
              <MutedText>
                Turning it off cancels every call it is booked to join.
              </MutedText>
              <Button
                variant="outline"
                onClick={() => {
                  save({ enabled: false });
                  onClose();
                }}
              >
                Turn off
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
