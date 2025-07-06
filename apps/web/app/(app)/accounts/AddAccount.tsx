"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
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

export function AddAccount() {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectGoogle = async () => {
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl: "/accounts", redirect: true });
    } catch (error) {
      console.error("Error initiating Google link:", error);
      toastError({
        title: "Error initiating Google link",
        description: "Please try again or contact support",
      });
    }
    setIsLoading(false);
  };

  const handleMergeGoogle = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/google/linking/auth-url", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: GetAuthLinkUrlResponse = await response.json();

      window.location.href = data.url;
    } catch (error) {
      console.error("Error initiating Google link:", error);
      toastError({
        title: "Error initiating Google link",
        description: "Please try again or contact support",
      });
    }
    setIsLoading(false);
  };

  return (
    <Card className="flex items-center justify-center">
      <CardContent className="flex flex-col items-center p-6">
        <Dialog>
          <DialogTrigger asChild>
            <Button disabled={isLoading} className="mt-auto">
              <Image
                src="/images/google.svg"
                alt=""
                width={24}
                height={24}
                unoptimized
              />
              <span className="ml-2">
                {isLoading ? "Connecting..." : "Add Google Account"}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Google Account</DialogTitle>
              <DialogDescription>
                Does the account you want to add already have an Inbox Zero
                account? If yes, we'll link it to your current account.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={handleMergeGoogle}
              >
                {isLoading ? "Connecting..." : "Yes"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={handleConnectGoogle}
              >
                {isLoading ? "Connecting..." : "No"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
