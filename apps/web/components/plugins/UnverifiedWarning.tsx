"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UnverifiedWarningProps {
  variant?: "default" | "install";
}

export function UnverifiedWarning({
  variant = "default",
}: UnverifiedWarningProps) {
  if (variant === "install") {
    return (
      <Alert
        variant="destructive"
        className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Unverified Source Warning</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>
            This plugin is NOT from the official Inbox Zero store. It has not
            been reviewed for security or quality.
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1 text-sm">
            <li>The source code has not been audited</li>
            <li>The publisher identity is not verified</li>
            <li>There are no user reviews or ratings</li>
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      variant="destructive"
      className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        Warning: Only install plugins from sources you trust
      </AlertTitle>
      <AlertDescription>
        Unverified plugins have not been reviewed by Inbox Zero. They may access
        your email data and perform actions on your behalf.
      </AlertDescription>
    </Alert>
  );
}
