"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import Image from "next/image";
import { MutedText } from "@/components/Typography";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { isGoogleProvider } from "@/utils/email/provider-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { useForm } from "react-hook-form";

interface FastmailTokenForm {
  token: string;
}

export function AddAccount() {
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingMicrosoft, setIsLoadingMicrosoft] = useState(false);
  const [isLoadingFastmail, setIsLoadingFastmail] = useState(false);
  const [fastmailModalOpen, setFastmailModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FastmailTokenForm>();

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

  const handleFastmailSubmit = async (data: FastmailTokenForm) => {
    setIsLoadingFastmail(true);

    try {
      const response = await fetch("/api/fastmail/linking/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.token }),
      });

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        throw new Error(`Server error (${response.status}). Check server logs.`);
      }

      if (!response.ok) {
        const errorMessage = result.error || result.message || "Failed to connect Fastmail account";
        console.error("API error response:", result);
        throw new Error(errorMessage);
      }

      toastSuccess({
        title: "Fastmail connected",
        description: result.message || "Your Fastmail account has been connected successfully",
      });

      reset();
      setFastmailModalOpen(false);
      window.location.href = "/accounts?success=account_created_and_linked";
    } catch (error) {
      console.error("Error connecting Fastmail:", error);
      toastError({
        title: "Error connecting Fastmail",
        description: error instanceof Error ? error.message : "Please try again or contact support",
      });
    } finally {
      setIsLoadingFastmail(false);
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
          disabled={isLoadingGoogle || isLoadingMicrosoft || isLoadingFastmail}
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
          disabled={isLoadingGoogle || isLoadingMicrosoft || isLoadingFastmail}
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
        <Dialog open={fastmailModalOpen} onOpenChange={setFastmailModalOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full"
              disabled={isLoadingGoogle || isLoadingMicrosoft || isLoadingFastmail}
            >
              <Image
                src="/images/fastmail.svg"
                alt=""
                width={24}
                height={24}
                unoptimized
              />
              <span className="ml-2">Add Fastmail</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Fastmail</DialogTitle>
              <DialogDescription>
                Enter your Fastmail API token to connect your account.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(handleFastmailSubmit)} className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  To create an API token:
                </p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1 mb-4">
                  <li>Go to Fastmail Settings → Privacy & Security → API tokens</li>
                  <li>Click "New API token"</li>
                  <li>Give it a name (e.g., "Inbox Zero")</li>
                  <li>Enable Mail access</li>
                  <li>Copy the token and paste it below</li>
                </ol>
                <Input
                  type="password"
                  name="token"
                  label="API Token"
                  placeholder="Enter your Fastmail API token"
                  registerProps={register("token", {
                    required: "API token is required",
                  })}
                  error={errors.token}
                />
              </div>
              <Button type="submit" loading={isLoadingFastmail} className="w-full">
                Connect Fastmail
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <MutedText>You will be billed for each account.</MutedText>
    </div>
  );
}
