"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import Image from "next/image";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex items-center justify-center">
      <CardContent className="flex flex-col items-center p-6">
        <ConfirmDialog
          trigger={
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
          }
          title="Connect Account"
          description="Note: If your email address is already connected to another user, you will not be able to connect it to this user. We will offer a way to merge accounts in the near future."
          confirmText="Got it"
          onConfirm={async () => {
            handleConnectGoogle();
          }}
        />
      </CardContent>
    </Card>
  );
}
