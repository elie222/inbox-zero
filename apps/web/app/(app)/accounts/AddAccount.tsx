"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import Image from "next/image";
import { MutedText } from "@/components/Typography";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function AddAccount() {
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingMicrosoft, setIsLoadingMicrosoft] = useState(false);

  const handleAddAccount = async (provider: "google" | "microsoft") => {
    const setLoading = isGoogleProvider(provider)
      ? setIsLoadingGoogle
      : setIsLoadingMicrosoft;
    setLoading(true);

    try {
      const url = await getAccountLinkingUrl(provider);
      window.location.href = url;
    } catch (error) {
      console.error(`Error initiating ${provider} link:`, error);
      toastError({
        title: `Error initiating ${isGoogleProvider(provider) ? "Google" : "Microsoft"} link`,
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
      </div>

      <MutedText>You will be billed for each account.</MutedText>
    </div>
  );
}
