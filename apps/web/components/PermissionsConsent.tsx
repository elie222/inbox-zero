"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeading, TypographyP } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { BRAND_NAME } from "@/utils/branding";
import { redirectToSafeUrl } from "@/utils/redirect";

export function PermissionsConsent() {
  const { t } = useLingui();
  const { emailAccountId, provider, isLoading: accountLoading } = useAccount();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const isMicrosoft = provider === "microsoft";

  const handleReconnect = async () => {
    setIsReconnecting(true);

    try {
      const accountProvider = provider === "microsoft" ? "microsoft" : "google";
      const url = await getAccountLinkingUrl(accountProvider, {
        reconnectEmailAccountId: emailAccountId,
      });
      redirectToSafeUrl(url, { allowExternal: true });
    } catch (error) {
      toastError({
        title: t`Error initiating reconnection`,
        description:
          error instanceof Error
            ? error.message
            : t`Please try again or contact support`,
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <PageHeading className="text-center">
        <Trans>We are missing permissions 😔</Trans>
      </PageHeading>

      <TypographyP className="mx-auto mt-4 max-w-prose text-center">
        {isMicrosoft
          ? t`Your Microsoft account is connected, but ${BRAND_NAME} is missing one or more required Microsoft 365 permissions.`
          : t`You must sign in and give access to all permissions for ${BRAND_NAME} to work.`}
      </TypographyP>

      {isMicrosoft && (
        <TypographyP className="mx-auto mt-3 max-w-prose text-center text-muted-foreground">
          <Trans>
            If your organization restricts user consent, ask your Microsoft 365
            admin to approve {BRAND_NAME} and then reconnect your account.
          </Trans>
        </TypographyP>
      )}
      {provider === "google" && (
        <TypographyP className="mx-auto mt-3 max-w-prose text-center text-muted-foreground">
          <Trans>
            Reconnect your account and tick every checkbox on Google&apos;s
            permissions screen, including Gmail access.
          </Trans>
        </TypographyP>
      )}

      <Button
        className="mt-4"
        onClick={handleReconnect}
        loading={isReconnecting}
        disabled={isReconnecting || accountLoading || !provider}
      >
        <Trans>Reconnect account</Trans>
      </Button>

      <p className="mt-8 text-center text-muted-foreground">
        <Trans>
          Having trouble?{" "}
          <Link href="/logout" className="underline hover:text-primary">
            Sign out
          </Link>{" "}
          and sign back in again.
        </Trans>
      </p>

      <div className="mt-8">
        <Image
          src="/images/illustrations/falling.svg"
          alt=""
          width={400}
          height={400}
          unoptimized
          className="dark:brightness-90 dark:invert"
        />
      </div>
    </div>
  );
}
