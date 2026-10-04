"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import Image from "next/image";
import { MutedText } from "@/components/Typography";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { FastmailAppTokenModal } from "@/app/(app)/accounts/FastmailAppTokenModal";
import { redirectToSafeUrl } from "@/utils/redirect";

export function AddAccount({
  helperText = "You will be billed for each account.",
}: {
  helperText?: ReactNode;
}) {
  const {
    data: providers,
    error,
    isLoading,
    mutate,
  } = useSWR<{
    google: boolean;
    microsoft: boolean;
    fastmail: boolean;
  }>("/api/user/mail-providers");
  const fastmailEnabled = providers?.fastmail;
  const [showFastmailTokenModal, setShowFastmailTokenModal] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingMicrosoft, setIsLoadingMicrosoft] = useState(false);

  const handleAddAccount = async (provider: "google" | "microsoft") => {
    const setLoading = {
      google: setIsLoadingGoogle,
      microsoft: setIsLoadingMicrosoft,
    }[provider];
    setLoading(true);

    try {
      const url = await getAccountLinkingUrl(provider);
      redirectToSafeUrl(url, { allowExternal: true });
    } catch (error) {
      console.error(`Error initiating ${provider} link:`, error);
      toastError({
        title: `Error initiating ${{ google: "Google", microsoft: "Microsoft", fastmail: "Fastmail" }[provider]} link`,
        description:
          error instanceof Error
            ? error.message
            : "Please try again or contact support",
      });
      setLoading(false);
    }
  };

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      errorComponent={
        <div role="alert" className="flex flex-col items-center gap-2">
          <p>Unable to load connection options.</p>
          <Button
            variant="outline"
            onClick={() => mutate().catch(() => undefined)}
          >
            Try again
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center gap-3 min-h-[90px]">
        <div className="flex items-center gap-2">
          {providers?.google && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleAddAccount("google")}
              loading={isLoadingGoogle}
              disabled={isLoadingGoogle || isLoadingMicrosoft}
            >
              <Image
                src="/images/google.svg"
                alt=""
                width={24}
                height={24}
                unoptimized
              />
              <span className="ml-2">Add Google</span>
            </Button>
          )}
          {providers?.microsoft && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleAddAccount("microsoft")}
              loading={isLoadingMicrosoft}
              disabled={isLoadingGoogle || isLoadingMicrosoft}
            >
              <Image
                src="/images/microsoft.svg"
                alt=""
                width={24}
                height={24}
                unoptimized
              />
              <span className="ml-2">Add Microsoft</span>
            </Button>
          )}
        </div>

        {fastmailEnabled && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFastmailTokenModal(true)}
              disabled={isLoadingGoogle || isLoadingMicrosoft}
            >
              Add Fastmail (App Token)
            </Button>
          </div>
        )}
        <FastmailAppTokenModal
          open={showFastmailTokenModal}
          onOpenChange={setShowFastmailTokenModal}
        />
        <MutedText>{helperText}</MutedText>
      </div>
    </LoadingContent>
  );
}
