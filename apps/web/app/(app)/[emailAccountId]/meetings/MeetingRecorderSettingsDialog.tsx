"use client";

import { useAction } from "next-safe-action/hooks";
import { ListCard } from "@/components/ListCard";
import { RadioCardGroup } from "@/components/RadioCardGroup";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import {
  useMeetingRecorderSettings,
  useMeetingRecorderUpcoming,
} from "@/hooks/useMeetingRecorder";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { getActionErrorMessage } from "@/utils/error";
import { updateMeetingRecorderSettingsAction } from "@/utils/actions/meeting-recorder";
import type { UpdateMeetingRecorderSettingsBody } from "@/utils/actions/meeting-recorder.validation";
import { JOIN_RULE_OPTIONS } from "@/app/(app)/[emailAccountId]/meetings/join-rule-options";

export function MeetingRecorderSettingsDialog({
  emailAccountId,
  open,
  onClose,
}: {
  emailAccountId: string;
  open: boolean;
  onClose: () => void;
}) {
  const analytics = useProductAnalytics();
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
        </DialogHeader>

        {data && (
          <div className="space-y-6">
            <div className="space-y-2">
              <ItemTitle>Which meetings to join</ItemTitle>
              <RadioCardGroup
                name="joinRule"
                ariaLabel="Which meetings to join"
                value={data.joinRule}
                onChange={(joinRule) => {
                  analytics.captureAction("meeting_recorder_setting_changed", {
                    setting: "join_rule",
                    value: joinRule,
                  });
                  save({ joinRule });
                }}
                options={JOIN_RULE_OPTIONS}
              />
            </div>

            <ListCard>
              <Item>
                <ItemContent>
                  <ItemTitle>Email me the notes</ItemTitle>
                </ItemContent>
                <Toggle
                  name="recapEmailEnabled"
                  ariaLabel="Email me the notes"
                  enabled={data.recapEmailEnabled}
                  onChange={(recapEmailEnabled) => {
                    analytics.captureAction(
                      "meeting_recorder_setting_changed",
                      { setting: "recap_email", value: recapEmailEnabled },
                    );
                    save({ recapEmailEnabled });
                  }}
                />
              </Item>

              <Item>
                <ItemContent>
                  <ItemTitle>Draft a follow-up email</ItemTitle>
                </ItemContent>
                <Toggle
                  name="followUpDraftEnabled"
                  ariaLabel="Draft a follow-up email"
                  enabled={data.followUpDraftEnabled}
                  onChange={(followUpDraftEnabled) => {
                    analytics.captureAction(
                      "meeting_recorder_setting_changed",
                      {
                        setting: "follow_up_draft",
                        value: followUpDraftEnabled,
                      },
                    );
                    save({ followUpDraftEnabled });
                  }}
                />
              </Item>
            </ListCard>

            <div className="flex items-center justify-between gap-4">
              <MutedText>Cancels every call it is booked to join.</MutedText>
              <Button
                variant="outline"
                onClick={() => {
                  analytics.captureAction("meeting_recorder_disabled");
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
