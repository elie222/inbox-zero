"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";
import { parseLiveEvent } from "@/utils/voice/live-events";
import {
  LIVE_CLOSE_TIMEOUT_MS,
  LIVE_ICE_TIMEOUT_MS,
} from "@/utils/voice/limits";
import { startMicrophoneLevelMeter } from "@/utils/voice/recording";
import {
  appendTranscriptDelta,
  groupTranscriptTurns,
  latestTurnText,
  type TranscriptFragment,
} from "@/utils/voice/transcript";
import type { LiveHistoryMessage } from "@/utils/voice/types";

export type VoiceLiveStatus = "idle" | "connecting" | "live" | "error";

export function useVoiceLive() {
  const { emailAccountId } = useAccount();
  const [status, setStatus] = useState<VoiceLiveStatus>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fragments, setFragments] = useState<TranscriptFragment[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopMeterRef = useRef<(() => void) | null>(null);
  const readyRef = useRef(false);
  const closeTimeoutRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    window.clearTimeout(closeTimeoutRef.current);
    readyRef.current = false;
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    microphoneRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(
    async (history: LiveHistoryMessage[] = []) => {
      setError(null);
      setFragments([]);
      setStatus("connecting");
      try {
        const connection = new RTCPeerConnection();
        peerRef.current = connection;
        const audio = new Audio();
        audio.autoplay = true;
        audioRef.current = audio;
        connection.addEventListener("track", (event) => {
          audio.srcObject = new MediaStream([event.track]);
          audio.play().catch(() => undefined);
        });

        const microphone = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        microphoneRef.current = microphone;
        stopMeterRef.current = startMicrophoneLevelMeter(microphone, setLevel);
        for (const track of microphone.getAudioTracks()) {
          connection.addTrack(track, microphone);
        }

        const channel = connection.createDataChannel("oai-events");
        channelRef.current = channel;
        channel.addEventListener("message", ({ data }) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(String(data));
          } catch {
            return;
          }
          const event = parseLiveEvent(parsed);
          if (event.type === "session.started") {
            readyRef.current = true;
            setStatus("live");
          } else if (event.type === "session.closed") {
            cleanup();
            setStatus("idle");
          } else if (event.type === "input_transcript") {
            setFragments((current) =>
              appendTranscriptDelta(
                current,
                "user",
                event.delta,
                event.startMs,
                event.endMs,
              ),
            );
          } else if (event.type === "output_transcript") {
            setFragments((current) =>
              appendTranscriptDelta(
                current,
                "assistant",
                event.delta,
                event.startMs,
                event.endMs,
              ),
            );
          }
        });

        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await waitForIceGathering(connection);
        const sdp = connection.localDescription?.sdp;
        if (!sdp) throw new Error("Could not start a live voice session.");

        const response = await fetchWithAccount({
          url: "/api/voice/live/session",
          emailAccountId,
          init: {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sdp, history }),
          },
        });
        const body = (await response.json()) as {
          sdp?: string;
          error?: string;
        };
        if (!response.ok || !body.sdp) {
          throw new Error(
            body.error || "Could not start a live voice session.",
          );
        }
        await connection.setRemoteDescription({
          type: "answer",
          sdp: body.sdp,
        });
      } catch (err) {
        cleanup();
        setStatus("error");
        setError(
          err instanceof Error
            ? err.message
            : "Could not start a live voice session.",
        );
      }
    },
    [cleanup, emailAccountId],
  );

  const stop = useCallback(() => {
    const channel = channelRef.current;
    if (readyRef.current && channel && channel.readyState === "open") {
      channel.send(JSON.stringify({ type: "session.close" }));
      closeTimeoutRef.current = window.setTimeout(() => {
        cleanup();
        setStatus("idle");
      }, LIVE_CLOSE_TIMEOUT_MS);
      return;
    }
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const cancel = useCallback(() => {
    cleanup();
    setStatus("idle");
    setError(null);
    setFragments([]);
  }, [cleanup]);

  const turns = groupTranscriptTurns(fragments);

  return {
    status,
    level,
    error,
    turns,
    userTranscript: latestTurnText(turns, "user"),
    assistantTranscript: latestTurnText(turns, "assistant"),
    start,
    stop,
    cancel,
  };
}

async function waitForIceGathering(connection: RTCPeerConnection) {
  if (connection.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      connection.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("Timed out while connecting voice."));
    }, LIVE_ICE_TIMEOUT_MS);
    function onState() {
      if (connection.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }
    connection.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}
