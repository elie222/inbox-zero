"use client";

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

export default function PermissionsConsentPage() {
  const { provider, isLoading: accountLoading } = useAccount();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const isMicrosoft = provider === "microsoft";

  const handleReconnect = async () => {
    setIsReconnecting(true);

    try {
      const accountProvider = provider === "microsoft" ? "microsoft" : "google";
      const url = await getAccountLinkingUrl(accountProvider);
      redirectToSafeUrl(url, { allowExternal: true });
    } catch {
      toastError({
        title: "Error initiating reconnection",
        description: "Please try again or contact support",
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center sm:p-20 md:p-32">
      <PageHeading className="text-center">
        We are missing permissions 😔
      </PageHeading>

      <TypographyP className="mx-auto mt-4 max-w-prose text-center">
        {isMicrosoft
          ? `Your Microsoft account is connected, but ${BRAND_NAME} is missing one or more required Microsoft 365 permissions.`
          : `You must sign in and give access to all permissions for ${BRAND_NAME} to work.`}
      </TypographyP>

      {isMicrosoft && (
        <TypographyP className="mx-auto mt-3 max-w-prose text-center text-muted-foreground">
          If your organization restricts user consent, ask your Microsoft 365
          admin to approve {BRAND_NAME} and then reconnect your account.
        </TypographyP>
      )}
      {!isMicrosoft && (
        <TypographyP className="mx-auto mt-3 max-w-prose text-center text-muted-foreground">
          Reconnect your account and approve every requested permission.
        </TypographyP>
      )}

      <Button
        className="mt-4"
        onClick={handleReconnect}
        loading={isReconnecting}
        disabled={isReconnecting || accountLoading}
      >
        Reconnect account
      </Button>

      <p className="mt-8 text-center text-muted-foreground">
        Having trouble?{" "}
        <Link href="/logout" className="underline hover:text-primary">
          Sign out
        </Link>{" "}
        and sign back in again.
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
