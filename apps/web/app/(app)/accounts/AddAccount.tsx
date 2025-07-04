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
import type { GetOutlookAuthLinkUrlResponse } from "@/app/api/outlook/linking/auth-url/route";

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

  const handleConnectMicrosoft = async () => {
    setIsLoading(true);
    try {
      await signIn("microsoft-entra-id", {
        callbackUrl: "/accounts",
        redirect: true,
      });
    } catch (error) {
      console.error("Error initiating Microsoft link:", error);
      toastError({
        title: "Error initiating Microsoft link",
        description: "Please try again or contact support",
      });
    }
    setIsLoading(false);
  };

  const handleMergeMicrosoft = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/outlook/linking/auth-url", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: GetOutlookAuthLinkUrlResponse = await response.json();

      window.location.href = data.url;
    } catch (error) {
      console.error("Error initiating Microsoft link:", error);
      toastError({
        title: "Error initiating Microsoft link",
        description: "Please try again or contact support",
      });
    }
    setIsLoading(false);
  };

  return (
    <Card className="flex items-center justify-center">
      <CardContent className="flex flex-col items-center p-6">
        <div className="flex w-full flex-col gap-4">
          {/* Google Account */}
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={isLoading} className="w-full">
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
                <DialogTitle>Add or Merge Google Account</DialogTitle>
                <DialogDescription>
                  Choose an action:
                  <ul className="mb-2 mt-2 list-disc pl-5">
                    <li>
                      <b>Connect Account:</b> Add an account that you haven't
                      yet added to Inbox Zero.
                    </li>
                    <li>
                      <b>Merge Another Account:</b> Sign in with a Google
                      account that's currently linked to a *different* Inbox
                      Zero user.
                    </li>
                  </ul>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline">Cancel</Button>
                <Button
                  variant="secondary"
                  disabled={isLoading}
                  onClick={handleMergeGoogle}
                >
                  Merge Another Account
                </Button>
                <Button disabled={isLoading} onClick={handleConnectGoogle}>
                  {isLoading ? "Connecting..." : "Connect Account"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Microsoft Account */}
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={isLoading} className="w-full">
                <Image
                  src="/images/microsoft.svg"
                  alt=""
                  width={24}
                  height={24}
                  unoptimized
                />
                <span className="ml-2">
                  {isLoading ? "Connecting..." : "Add Microsoft Account"}
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add or Merge Microsoft Account</DialogTitle>
                <DialogDescription>
                  Choose an action:
                  <ul className="mb-2 mt-2 list-disc pl-5">
                    <li>
                      <b>Connect Account:</b> Add an account that you haven't
                      yet added to Inbox Zero.
                    </li>
                    <li>
                      <b>Merge Another Account:</b> Sign in with a Microsoft
                      account that's currently linked to a *different* Inbox
                      Zero user.
                    </li>
                  </ul>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline">Cancel</Button>
                <Button
                  variant="secondary"
                  disabled={isLoading}
                  onClick={handleMergeMicrosoft}
                >
                  Merge Another Account
                </Button>
                <Button disabled={isLoading} onClick={handleConnectMicrosoft}>
                  {isLoading ? "Connecting..." : "Connect Account"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
