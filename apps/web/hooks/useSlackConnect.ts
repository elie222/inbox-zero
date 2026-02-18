"use client";

import { useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { fetchWithAccount } from "@/utils/fetch";
import { captureException, getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess, toastInfo } from "@/components/Toast";
import { linkSlackWorkspaceAction } from "@/utils/actions/messaging-channels";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";

export function useSlackConnect({
  emailAccountId,
  onConnected,
}: {
  emailAccountId: string;
  onConnected?: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const connectingRef = useRef(false);

  const { executeAsync: linkSlack } = useAction(
    linkSlackWorkspaceAction.bind(null, emailAccountId),
  );

  const connect = async () => {
    if (connecting || connectingRef.current) return;

    connectingRef.current = true;
    setConnecting(true);
    try {
      const res = await fetchWithAccount({
        url: "/api/slack/auth-url",
        emailAccountId,
      });
      if (!res.ok) throw new Error("Failed to get Slack auth URL");
      const data: GetSlackAuthUrlResponse = await res.json();

      if (data.existingWorkspace) {
        const result = await linkSlack({
          teamId: data.existingWorkspace.teamId,
        });

        if (!result?.serverError && !result?.validationErrors) {
          toastSuccess({ description: "Slack connected" });
          onConnected?.();
          return;
        }

        const linkError = getActionErrorMessage(
          {
            serverError: result?.serverError,
            validationErrors: result?.validationErrors,
          },
          "Failed to link Slack workspace",
        );

        if (linkError.includes("Could not find your Slack account")) {
          // Email mismatch in Slack profile — fall through to OAuth install.
          toastInfo({
            title: "Email not found in Slack",
            description: "Redirecting to Slack authorization...",
          });
        } else {
          toastError({ description: linkError });
          return;
        }
      }

      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (error) {
      captureException(error, { extra: { context: "Slack connect" } });
      toastError({ description: "Failed to connect Slack" });
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  };

  return { connect, connecting };
}
