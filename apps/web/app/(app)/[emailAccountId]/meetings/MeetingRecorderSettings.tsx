"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { MeetingJoinRule } from "@/generated/prisma/enums";
import { useMeetingRecorderSettings } from "@/hooks/useMeetingRecorder";
import { getActionErrorMessage } from "@/utils/error";
import { updateMeetingRecorderSettingsAction } from "@/utils/actions/meeting-recorder";
import type { UpdateMeetingRecorderSettingsBody } from "@/utils/actions/meeting-recorder.validation";
import {
  getJoinRuleOption,
  JOIN_RULE_OPTIONS,
} from "@/app/(app)/[emailAccountId]/meetings/join-rule-options";

export function MeetingRecorderSettings({
  emailAccountId,
  hasCalendarConnected,
}: {
  emailAccountId: string;
  hasCalendarConnected: boolean;
}) {
  const { data, isLoading, error, mutate } = useMeetingRecorderSettings();

  const { execute } = useAction(
    updateMeetingRecorderSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        mutate();
      },
      onError: ({ error }) => {
        toastError({
          description: getActionErrorMessage(error, {
            prefix: "Failed to save settings",
          }),
        });
      },
    },
  );

  const save = (update: UpdateMeetingRecorderSettingsBody) => execute(update);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-32 w-full" />}
    >
      <div className="space-y-2">
        {!hasCalendarConnected && (
          <SettingCard
            title="Connect a calendar"
            description="The notetaker needs a connected calendar to know which calls to join."
            right={
              <Button asChild variant="outline">
                <Link href={`/${emailAccountId}/calendars`}>
                  Connect calendar
                </Link>
              </Button>
            }
          />
        )}

        <SettingCard
          title="Enable the notetaker"
          description="Send a bot to your calls to record, transcribe and summarize them"
          right={
            <Toggle
              name="enabled"
              enabled={!!data?.enabled}
              onChange={(enabled) => save({ enabled })}
              disabled={!hasCalendarConnected}
            />
          }
        />

        {!!data?.enabled && (
          <>
            <SettingCard
              title="Which meetings to join"
              description="You can still turn individual meetings on or off"
              collapseOnMobile
              right={
                <div className="w-56">
                  <Select
                    value={data.joinRule}
                    onValueChange={(value) =>
                      save({ joinRule: value as MeetingJoinRule })
                    }
                  >
                    <SelectTrigger aria-label="Which meetings to join">
                      <SelectValue>
                        {getJoinRuleOption(data.joinRule).label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end" className="w-[22rem]">
                      {JOIN_RULE_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="items-start py-2"
                        >
                          <div className="flex flex-col text-left">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            />

            <SettingCard
              title="Email me the notes"
              description="Send the summary to your inbox after each call"
              right={
                <Toggle
                  name="recapEmailEnabled"
                  enabled={data.recapEmailEnabled}
                  onChange={(recapEmailEnabled) => save({ recapEmailEnabled })}
                />
              }
            />

            <SettingCard
              title="Draft a follow-up email"
              description="Leave a follow-up to the other attendees in your drafts. Nothing is ever sent for you."
              right={
                <Toggle
                  name="followUpDraftEnabled"
                  enabled={data.followUpDraftEnabled}
                  onChange={(followUpDraftEnabled) =>
                    save({ followUpDraftEnabled })
                  }
                />
              }
            />
          </>
        )}
      </div>
    </LoadingContent>
  );
}
