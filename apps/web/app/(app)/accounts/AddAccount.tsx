"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import Image from "next/image";
import { TypographyP } from "@/components/Typography";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { MailIcon } from "lucide-react";
import { FastmailAppTokenModal } from "./FastmailAppTokenModal";
import { useFastmailEnabled } from "@/hooks/useFeatureFlags";

type Provider = "google" | "microsoft" | "fastmail";

const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  fastmail: "Fastmail",
};

export function AddAccount() {
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingMicrosoft, setIsLoadingMicrosoft] = useState(false);
  const [isLoadingFastmail, setIsLoadingFastmail] = useState(false);
  const [showAppTokenModal, setShowAppTokenModal] = useState(false);
  const fastmailEnabled = useFastmailEnabled();

  const isAnyLoading =
    isLoadingGoogle || isLoadingMicrosoft || isLoadingFastmail;

  const handleAddAccount = async (provider: Provider) => {
    const setLoadingMap: Record<Provider, (loading: boolean) => void> = {
      google: setIsLoadingGoogle,
      microsoft: setIsLoadingMicrosoft,
      fastmail: setIsLoadingFastmail,
    };
    const setLoading = setLoadingMap[provider];
    setLoading(true);

    try {
      const url = await getAccountLinkingUrl(provider);
      window.location.href = url;
    } catch (error) {
      console.error(`Error initiating ${provider} link:`, error);
      toastError({
        title: `Error initiating ${PROVIDER_DISPLAY_NAMES[provider]} link`,
        description: "Please try again or contact support",
      });
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 min-h-[90px]">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handleAddAccount("google")}
          loading={isLoadingGoogle}
          disabled={isAnyLoading}
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
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handleAddAccount("microsoft")}
          loading={isLoadingMicrosoft}
          disabled={isAnyLoading}
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
        {fastmailEnabled && (
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleAddAccount("fastmail")}
              loading={isLoadingFastmail}
              disabled={isAnyLoading}
            >
              <MailIcon className="size-6 text-[#5c2d91]" />
              <span className="ml-2">Add Fastmail</span>
            </Button>
            <button
              type="button"
              onClick={() => setShowAppTokenModal(true)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
              disabled={isAnyLoading}
            >
              Use App Token instead
            </button>
          </div>
        )}
      </div>

      <TypographyP className="text-sm text-muted-foreground">
        You will be billed for each account.
      </TypographyP>

      <FastmailAppTokenModal
        open={showAppTokenModal}
        onOpenChange={setShowAppTokenModal}
      />
    </div>
  );
}
