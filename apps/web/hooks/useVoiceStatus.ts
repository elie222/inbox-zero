"use client";

import useSWR from "swr";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetVoiceStatusResponse } from "@/app/api/voice/status/route";
import { env } from "@/env";

const DISABLED_STATUS = {
  enabled: false,
  provider: null,
  providerName: null,
  transcribe: false,
  synthesize: false,
  live: false,
  ttsVoice: null,
  liveVoice: null,
} as const;

export function useVoiceStatus() {
  const { emailAccountId } = useAccount();
  const disabled = env.NEXT_PUBLIC_VOICE_ENABLED === false;
  const { data, error, isLoading, mutate } = useSWR<GetVoiceStatusResponse>(
    disabled || !emailAccountId ? null : "/api/voice/status",
  );

  return {
    status: data ?? DISABLED_STATUS,
    error,
    isLoading: disabled ? false : isLoading,
    mutate,
  };
}
