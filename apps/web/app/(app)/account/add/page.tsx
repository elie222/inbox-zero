"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";

export default function AddAccountPage() {
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
    <div className="flex items-center justify-center p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Connect Google Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Connect an additional Google account to manage its inbox and allow
            login.
          </p>
          <Button onClick={handleConnectGoogle} disabled={isLoading}>
            {isLoading ? "Redirecting..." : "Connect with Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
