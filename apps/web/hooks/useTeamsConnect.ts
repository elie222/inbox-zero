"use client";

import { useRef, useState } from "react";
import { fetchWithAccount } from "@/utils/fetch";
import { captureException } from "@/utils/error";
import { toastError } from "@/components/Toast";
import type { GetTeamsAuthUrlResponse } from "@/app/api/teams/auth-url/route";

export function useTeamsConnect({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [connecting, setConnecting] = useState(false);
  const connectingRef = useRef(false);

  const connect = async () => {
    if (connecting || connectingRef.current) return;

    connectingRef.current = true;
    setConnecting(true);

    try {
      const res = await fetchWithAccount({
        url: "/api/teams/auth-url",
        emailAccountId,
      });
      if (!res.ok) throw new Error("Failed to get Teams auth URL");

      const data: GetTeamsAuthUrlResponse = await res.json();
      if (!data.url) throw new Error("No auth URL returned");

      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      captureException(error, { extra: { context: "Teams connect" } });
      toastError({ description: "Failed to connect Teams" });
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  };

  return { connect, connecting };
}
