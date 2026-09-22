"use client";

import { useEffect, useState } from "react";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { mailEngineConnectionCopy } from "@/utils/mail-engine/connection-notice";
import { redirectToSafeUrl } from "@/utils/redirect";

export function MailEngineConnectionBanner() {
  const { emailAccountId, provider } = useAccount();
  const client = useOptionalMailClient();
  const [connection, setConnection] = useState<
    "ready" | "offline" | "blocked_auth" | undefined
  >();
  const [reconnecting, setReconnecting] = useState(false);
  const copy = mailEngineConnectionCopy(connection);

  useEffect(() => {
    if (!client || !emailAccountId) {
      setConnection(undefined);
      return;
    }
    const handle = client.observeMailbox({
      accountIds: [emailAccountId],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 1,
      after: null,
    });
    const apply = () => {
      setConnection(handle.getSnapshot().data?.connection);
    };
    const unsubscribe = handle.subscribe(apply);
    apply();
    return () => {
      unsubscribe();
      handle.close();
    };
  }, [client, emailAccountId]);

  if (!copy) return null;

  if (connection === "offline") {
    return (
      <p
        className="border-border border-b px-4 py-2 text-muted-foreground text-sm"
        role="status"
      >
        {copy.title} {copy.description}
      </p>
    );
  }

  return (
    <AppAlertBanner
      action={
        copy.action ? (
          <Button
            disabled={reconnecting || !emailAccountId}
            onClick={() => {
              setReconnecting(true);
              getAccountLinkingUrl(
                isMicrosoftProvider(provider) ? "microsoft" : "google",
                { reconnectEmailAccountId: emailAccountId },
              )
                .then((url) => redirectToSafeUrl(url, { allowExternal: true }))
                .catch((error: unknown) => {
                  toastError({
                    title: "Error initiating reconnection",
                    description:
                      error instanceof Error
                        ? error.message
                        : "Please try again or contact support",
                  });
                })
                .finally(() => setReconnecting(false));
            }}
            size="sm"
          >
            {copy.action}
          </Button>
        ) : null
      }
      description={copy.description}
      title={copy.title}
    />
  );
}
