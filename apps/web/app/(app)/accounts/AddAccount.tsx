"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import {
  DialogFooter,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  Dialog,
} from "@/components/ui/dialog";
import type { GetAuthLinkUrlResponse } from "@/app/api/google/linking/auth-url/route";

export function AddAccount() {
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  const handleYes = () => {
    setIsDialogOpen(false);
    handleMergeGoogle();
  };

  const handleNo = () => {
    setIsDialogOpen(false);
    handleConnectGoogle();
  };

  return (
    <Card className="flex items-center justify-center">
      <CardContent className="flex flex-col items-center p-6">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              disabled={isLoading}
              className="mt-auto"
              onClick={() => setIsDialogOpen(true)}
            >
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
              <DialogTitle>
                Has the account you want to add already signed up to Inbox Zero?
              </DialogTitle>
            </DialogHeader>
            <DialogFooter className="gap-1.5 sm:justify-end">
              <Button onClick={handleYes}>Yes</Button>
              <Button onClick={handleNo}>No</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
