"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";
import {
  blobToBase64,
  pickRecorderMimeType,
  startMicrophoneLevelMeter,
} from "@/utils/voice/recording";
import { MAX_RECORDING_MS } from "@/utils/voice/limits";

export type VoiceDictationStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing"
  | "error";

export type VoiceDictationResult = {
  text: string;
  error: string | null;
};

export function useVoiceDictation() {
  const { emailAccountId } = useAccount();
  const [status, setStatus] = useState<VoiceDictationStatus>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stopMeterRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number>(0);
  const blobWaiterRef = useRef<Promise<Blob> | null>(null);
  const activeRef = useRef(true);

  const cleanup = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      let resolveBlob: (blob: Blob) => void = () => undefined;
      blobWaiterRef.current = new Promise((resolve) => {
        resolveBlob = resolve;
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        resolveBlob(
          new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          }),
        );
      };
      recorderRef.current = recorder;
      stopMeterRef.current = startMicrophoneLevelMeter(stream, setLevel);
      recorder.start();
      setStatus("recording");
      timeoutRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (err) {
      cleanup();
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Microphone access was blocked.",
      );
    }
  }, [cleanup]);

  const stop = useCallback(async (): Promise<VoiceDictationResult> => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    const blob = (await blobWaiterRef.current) ?? new Blob();
    blobWaiterRef.current = null;
    cleanup();

    if (!blob.size) {
      setStatus("idle");
      return { text: "", error: null };
    }

    setStatus("transcribing");
    try {
      const response = await fetchWithAccount({
        url: "/api/voice/transcribe",
        emailAccountId,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            audioBase64: await blobToBase64(blob),
            mimeType: blob.type || "audio/webm",
          }),
        },
      });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Could not transcribe that recording.");
      }
      setStatus("idle");
      return { text: (body.text ?? "").trim(), error: null };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not transcribe that recording.";
      setStatus("error");
      setError(message);
      return { text: "", error: message };
    }
  }, [cleanup, emailAccountId]);

  const cancel = useCallback(() => {
    cleanup();
    blobWaiterRef.current = null;
    setStatus("idle");
    setError(null);
  }, [cleanup]);

  return { status, level, error, start, stop, cancel };
}
