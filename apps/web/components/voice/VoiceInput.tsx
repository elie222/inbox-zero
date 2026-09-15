"use client";

import { AudioLinesIcon, MicIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { VoiceOverlay } from "@/components/voice/VoiceOverlay";
import { toastError } from "@/components/Toast";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";
import { useVoiceLive } from "@/hooks/useVoiceLive";
import { useVoiceStatus } from "@/hooks/useVoiceStatus";
import { cn } from "@/utils";
import { createClientLogger } from "@/utils/logger-client";
import type { LiveHistoryMessage } from "@/utils/voice/types";

const logger = createClientLogger("voice-input");

export function VoiceInput({
  liveEnabled = false,
  liveHistory,
  onInsert,
  onSend,
  className,
}: {
  liveEnabled?: boolean;
  liveHistory?: LiveHistoryMessage[];
  onInsert: (text: string) => void;
  onSend: (text: string) => void;
  className?: string;
}) {
  const analytics = useProductAnalytics();
  const { status: voiceStatus } = useVoiceStatus();
  const dictation = useVoiceDictation();
  const live = useVoiceLive();
  const [mode, setMode] = useState<"dictation" | "live" | null>(null);
  const finishingDictationRef = useRef(false);

  const canDictate = Boolean(voiceStatus.transcribe);
  const canLive = Boolean(liveEnabled && voiceStatus.live);
  const overlayOpen = mode !== null;

  const beginDictation = useCallback(async () => {
    finishingDictationRef.current = false;
    setMode("dictation");
    analytics.captureAction("chat_voice_dictation_started", {
      live_available: canLive,
    });
    await dictation.start();
  }, [analytics, canLive, dictation]);

  const beginLive = useCallback(async () => {
    setMode("live");
    analytics.captureAction("chat_voice_live_started");
    await live.start(liveHistory);
  }, [analytics, live, liveHistory]);

  const finishDictation = useCallback(
    async (submit: boolean) => {
      if (finishingDictationRef.current) return;
      finishingDictationRef.current = true;
      const { text, error } = await dictation.stop();
      setMode(null);
      if (error) {
        toastError({ description: error });
        return;
      }
      if (!text) return;
      if (submit) onSend(text);
      else onInsert(text);
    },
    [dictation, onInsert, onSend],
  );

  const finishLive = useCallback(
    (submit: boolean) => {
      const text = live.userTranscript.trim();
      live.stop();
      if (submit && text) onSend(text);
      else if (text) onInsert(text);
      setMode(null);
    },
    [live, onInsert, onSend],
  );

  if (!canDictate && !canLive) return null;

  return (
    <>
      <div className={cn("flex items-center gap-1", className)}>
        {canDictate ? (
          <Tooltip content="Dictate">
            <Button
              aria-label="Dictate"
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
              data-testid="voice-dictate-button"
              onClick={() => {
                beginDictation().catch((error) => {
                  toastVoiceError(error, "Could not start the microphone.");
                });
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MicIcon className="size-4" />
            </Button>
          </Tooltip>
        ) : null}
        {canLive ? (
          <Tooltip content="Live conversation">
            <Button
              aria-label="Start live conversation"
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
              data-testid="voice-live-button"
              onClick={() => {
                beginLive().catch((error) => {
                  toastVoiceError(
                    error,
                    "Could not start a live conversation.",
                  );
                });
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <AudioLinesIcon className="size-4" />
            </Button>
          </Tooltip>
        ) : null}
      </div>
      {overlayOpen ? (
        <VoiceOverlay
          assistantTranscript={
            mode === "live" ? live.assistantTranscript : undefined
          }
          busy={
            dictation.status === "transcribing" ||
            dictation.status === "requesting" ||
            live.status === "connecting"
          }
          error={mode === "live" ? live.error : dictation.error}
          level={mode === "live" ? live.level : dictation.level}
          mode={mode === "live" ? "live" : "dictation"}
          onDismiss={() => {
            if (mode === "live") live.cancel();
            else dictation.cancel();
            setMode(null);
          }}
          onSend={() => {
            if (mode === "live") finishLive(true);
            else
              finishDictation(true).catch((error) => {
                toastVoiceError(error, "Could not finish dictation.");
              });
          }}
          onStop={() => {
            if (mode === "live") finishLive(false);
            else
              finishDictation(false).catch((error) => {
                toastVoiceError(error, "Could not finish dictation.");
              });
          }}
          transcript={mode === "live" ? live.userTranscript : ""}
        />
      ) : null}
    </>
  );
}

function toastVoiceError(error: unknown, fallback: string) {
  logger.error("Voice UI error", {
    error: error instanceof Error ? error.message : String(error),
  });
  toastError({ description: fallback });
}
