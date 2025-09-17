"use client";

import { useState } from "react";
import { signIn } from "@/utils/auth-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import Image from "next/image";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { DialogTrigger } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import type { GetAuthLinkUrlResponse } from "@/app/api/google/linking/auth-url/route";
import type { GetOutlookAuthLinkUrlResponse } from "@/app/api/outlook/linking/auth-url/route";
import { SCOPES as GMAIL_SCOPES } from "@/utils/gmail/scopes";

export function AddAccount() {
  const handleConnectGoogle = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: "/accounts",
      scopes: [...GMAIL_SCOPES],
    });
  };

  const handleMergeGoogle = async () => {
    const response = await fetch("/api/google/linking/auth-url", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data: GetAuthLinkUrlResponse = await response.json();

    window.location.href = data.url;
  };

  const handleConnectMicrosoft = async (action: "merge" | "create") => {
    const response = await fetch(
      `/api/outlook/linking/auth-url?action=${action}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!response.ok) {
      toastError({
        title: "Error initiating Microsoft link",
        description: "Please try again or contact support",
      });
      return;
    }

    const data: GetOutlookAuthLinkUrlResponse = await response.json();

    window.location.href = data.url;
  };

  const handleCreateMicrosoft = () => handleConnectMicrosoft("create");
  const handleMergeMicrosoft = () => handleConnectMicrosoft("merge");

  return (
    <Card className="flex items-center justify-center">
      <CardContent className="flex flex-col items-center gap-4 p-6">
        <AddEmailAccount
          name="Google"
          image="/images/google.svg"
          handleConnect={handleConnectGoogle}
          handleMerge={handleMergeGoogle}
        />
        <AddEmailAccount
          name="Microsoft"
          image="/images/microsoft.svg"
          handleConnect={handleCreateMicrosoft}
          handleMerge={handleMergeMicrosoft}
        />
      </CardContent>
    </Card>
  );
}

function AddEmailAccount({
  name,
  image,
  handleConnect,
  handleMerge,
}: {
  name: "Google" | "Microsoft";
  image: string;
  handleConnect: () => Promise<void>;
  handleMerge: () => Promise<void>;
}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const onConnect = async () => {
    setIsConnecting(true);
    try {
      await handleConnect();
    } catch (error) {
      console.error(`Error initiating ${name} link:`, error);
      toastError({
        title: `Error initiating ${name} link`,
        description: "Please try again or contact support",
      });
    }
    setIsConnecting(false);
  };

  const onMerge = async () => {
    setIsMerging(true);

    try {
      await handleMerge();
    } catch (error) {
      console.error(`Error initiating ${name} link:`, error);
      toastError({
        title: `Error initiating ${name} link`,
        description: "Please try again or contact support",
      });
    }

    setIsMerging(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          disabled={isConnecting}
          variant="outline"
          className="mt-auto w-full"
        >
          <Image src={image} alt="" width={24} height={24} unoptimized />
          <span className="ml-2">
            {isConnecting ? "Connecting..." : `Add ${name} Account`}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add {name} Account</DialogTitle>
          <DialogDescription>
            Does the account you want to add already have an Inbox Zero account?
            If yes, we'll link it to your current account.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            loading={isMerging}
            disabled={isMerging || isConnecting}
            onClick={onMerge}
          >
            Yes, it's an existing Inbox Zero account
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={isConnecting}
            disabled={isMerging || isConnecting}
            onClick={onConnect}
          >
            No, it's a new account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
