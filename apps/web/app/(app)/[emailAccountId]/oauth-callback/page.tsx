"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircleIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OAuthCallbackPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    // Auto-close after a delay (longer for errors so user can read the message)
    const delay = error ? 3000 : 1500;
    const timer = setTimeout(() => {
      window.close();
    }, delay);

    return () => clearTimeout(timer);
  }, [error]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-4">
          <XCircleIcon className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-semibold">Connection Failed</h1>
          <p className="text-muted-foreground max-w-md">
            There was a problem connecting your account. Please close this
            window and try again.
          </p>
          <Button variant="outline" onClick={() => window.close()}>
            Close Window
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto" />
        <h1 className="text-2xl font-semibold">Connected!</h1>
        <p className="text-muted-foreground">
          This window will close automatically...
        </p>
      </div>
    </div>
  );
}
