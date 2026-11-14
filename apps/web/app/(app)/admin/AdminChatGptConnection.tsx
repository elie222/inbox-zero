"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAdminChatGptConnection } from "@/hooks/useAdminChatGptConnection";
import { adminDisconnectChatGptAction } from "@/utils/actions/admin";
import { getActionErrorMessage } from "@/utils/error";
import type { GetChatGptConnectUrlResponse } from "@/app/api/admin/chatgpt/connect/route";
import type { GetChatGptConnectionResponse } from "@/app/api/admin/chatgpt/route";

const RESULT_MESSAGES: Record<string, string> = {
  cancelled: "ChatGPT sign-in was cancelled.",
  plan_not_granted:
    "ChatGPT connected without permission to use your plan. Connect again and allow plan usage.",
  invalid_state: "The ChatGPT sign-in link expired. Try again.",
  forbidden: "Only admins can connect ChatGPT.",
  disabled: "Set CHATGPT_PLAN_ENABLED=true to connect ChatGPT.",
  error: "ChatGPT sign-in failed. Check the server logs and try again.",
};

export function AdminChatGptConnection() {
  const { data, isLoading, error, mutate } = useAdminChatGptConnection();
  const [isConnecting, setIsConnecting] = useState(false);
  const result = useSearchParams().get("chatgpt");

  const { execute: disconnect, isExecuting: isDisconnecting } = useAction(
    adminDisconnectChatGptAction,
    {
      onSuccess: ({ data }) => {
        toastSuccess({
          description: data?.revoked
            ? "ChatGPT disconnected."
            : "ChatGPT disconnected here. Also remove Inbox Zero under ChatGPT Settings → Connected apps.",
        });
        mutate();
      },
      onError: (error) => {
        toastError({
          title: "Could not disconnect ChatGPT",
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  const connect = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/admin/chatgpt/connect");
      const body = (await response.json()) as
        | GetChatGptConnectUrlResponse
        | { error?: string };
      if (!response.ok || !("url" in body)) {
        throw new Error(("error" in body && body.error) || "Request failed");
      }
      window.location.href = body.url;
    } catch (error) {
      setIsConnecting(false);
      toastError({
        title: "Could not start ChatGPT sign-in",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <section aria-labelledby="chatgpt-heading" className="max-w-xl space-y-4">
      <h2 id="chatgpt-heading" className="text-lg font-semibold">
        Sign in with ChatGPT
      </h2>
      <p className="text-sm text-muted-foreground">
        Run Inbox Zero&apos;s AI on your ChatGPT Plus or Pro plan instead of an
        API key. Use it with <code>DEFAULT_LLMS=chatgpt:gpt-6.1-sol</code>.
        Usage counts toward your plan limits; review it under ChatGPT Settings →
        Usage.
      </p>

      {result === "connected" && (
        <p className="text-sm text-green-700">ChatGPT connected.</p>
      )}
      {result && RESULT_MESSAGES[result] && (
        <p className="text-sm text-red-600">{RESULT_MESSAGES[result]}</p>
      )}

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <ConnectionControls
            status={data}
            isConnecting={isConnecting}
            isDisconnecting={isDisconnecting}
            onConnect={connect}
            onDisconnect={() => disconnect()}
          />
        )}
      </LoadingContent>
    </section>
  );
}

function ConnectionControls({
  status,
  isConnecting,
  isDisconnecting,
  onConnect,
  onDisconnect,
}: {
  status: GetChatGptConnectionResponse;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!status.reachableFromBrowser) {
    return (
      <p className="text-sm">
        ChatGPT sign-in only works when Inbox Zero runs on this machine (
        <code>NEXT_PUBLIC_BASE_URL</code> on localhost).
      </p>
    );
  }

  if (status.connected) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm">
          Connected{status.email ? ` as ${status.email}` : ""}.
        </p>
        <Button
          variant="outline"
          loading={isDisconnecting}
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button loading={isConnecting} onClick={onConnect}>
      Continue with ChatGPT
    </Button>
  );
}
