"use client";

import { useState } from "react";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/components/Toast";
import { useVoiceStatus } from "@/hooks/useVoiceStatus";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";
import { voiceStatusSummary } from "@/utils/voice/catalog";

export function VoiceSetting() {
  const { status, error, isLoading } = useVoiceStatus();

  return (
    <SettingCard
      title="Spoken voice"
      description={
        isLoading
          ? "Dictation, live conversations, and spoken replies when a voice provider is configured."
          : voiceStatusSummary(status)
      }
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          {status.synthesize ? <HearSampleButton /> : null}
        </LoadingContent>
      }
    />
  );
}

function HearSampleButton() {
  const { emailAccountId } = useAccount();
  const [playing, setPlaying] = useState(false);

  return (
    <Button
      disabled={playing}
      onClick={async () => {
        setPlaying(true);
        try {
          const response = await fetchWithAccount({
            url: "/api/voice/speak",
            emailAccountId,
            init: {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                text: "This is how replies will sound when spoken.",
              }),
            },
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(body.error || "Could not play a sample.");
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          await audio.play();
          toastSuccess({ description: "Playing a sample." });
        } catch (error) {
          toastError({
            description:
              error instanceof Error
                ? error.message
                : "Could not play a voice sample.",
          });
        } finally {
          setPlaying(false);
        }
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {playing ? "Playing…" : "Hear a sample"}
    </Button>
  );
}
