"use client";

import { ArrowUpIcon, Loader2Icon, SquareIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioLevelBars } from "@/components/voice/AudioLevelBars";

export function VoiceOverlay({
  mode,
  transcript,
  assistantTranscript,
  level,
  busy,
  error,
  onStop,
  onSend,
  onDismiss,
}: {
  mode: "dictation" | "live";
  transcript: string;
  assistantTranscript?: string;
  level: number;
  busy?: boolean;
  error?: string | null;
  onStop: () => void;
  onSend: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-3xl bg-zinc-900 px-3 py-2 text-white shadow-2xl"
        data-testid="voice-overlay"
        role="status"
      >
        <AudioLevelBars active={!busy} level={level} />
        <p className="min-w-0 flex-1 truncate text-sm">
          {error
            ? error
            : overlayLabel({ mode, transcript, assistantTranscript, busy })}
        </p>
        {onDismiss ? (
          <Button
            aria-label="Cancel voice"
            className="size-8 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onDismiss}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        ) : null}
        <Button
          aria-label={mode === "live" ? "End conversation" : "Stop recording"}
          className="size-9 rounded-full bg-violet-500 text-white hover:bg-violet-400"
          disabled={busy}
          onClick={onStop}
          size="icon"
          type="button"
        >
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SquareIcon className="size-3.5 fill-current" />
          )}
        </Button>
        <Button
          aria-label={mode === "live" ? "Send to chat" : "Send"}
          className="size-9 rounded-full bg-violet-500 text-white hover:bg-violet-400"
          disabled={busy}
          onClick={onSend}
          size="icon"
          type="button"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function overlayLabel({
  mode,
  transcript,
  assistantTranscript,
  busy,
}: {
  mode: "dictation" | "live";
  transcript: string;
  assistantTranscript?: string;
  busy?: boolean;
}) {
  if (transcript) return transcript;
  if (assistantTranscript) return assistantTranscript;
  if (busy && mode === "dictation") return "Transcribing…";
  return "Listening…";
}
