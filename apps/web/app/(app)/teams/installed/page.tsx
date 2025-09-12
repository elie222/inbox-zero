"use client";

import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function TeamsInstalledPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const success = searchParams.get("success");
  const [isLoading, setIsLoading] = useState(!error && !success);

  useEffect(() => {
    if (!error && !success) {
      // Still processing, show loading state
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 5000); // Timeout after 5 seconds
      return () => clearTimeout(timer);
    } else {
      setIsLoading(false);
    }
  }, [error, success]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Installing Inbox Zero for Teams...</h1>
        <p className="text-gray-600 text-center max-w-md">
          Please wait while we complete the installation process.
        </p>
      </div>
    );
  }

  if (error) {
    const errorMessages = {
      invalid_state: "Invalid authentication state. Please try again.",
      invalid_state_format: "Authentication error. Please try again.",
      missing_code: "Authentication was not completed. Please try again.",
      auth_failed: "Microsoft authentication failed. Please check your permissions and try again.",
      installation_failed: "Failed to install the Teams app. Please try again or contact support.",
    };

    const errorMessage = errorMessages[error as keyof typeof errorMessages] || "An unexpected error occurred.";

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <XCircle className="h-12 w-12 text-red-500 mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Installation Failed</h1>
        <p className="text-gray-600 text-center max-w-md mb-6">{errorMessage}</p>
        <div className="flex gap-4">
          <Button asChild>
            <Link href="/teams/setup">Try Again</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/settings">Go to Settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
      <h1 className="text-2xl font-semibold mb-2">Inbox Zero Successfully Installed!</h1>
      <p className="text-gray-600 text-center max-w-md mb-6">
        Inbox Zero has been successfully installed for your Microsoft Teams workspace. 
        You can now access Inbox Zero directly from Teams.
      </p>
      
      <div className="bg-gray-50 rounded-lg p-6 mb-6 max-w-md">
        <h2 className="font-semibold mb-3">Next Steps:</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>Open Microsoft Teams</li>
          <li>Look for Inbox Zero in your apps</li>
          <li>Pin the app for easy access</li>
          <li>Start managing your emails from Teams!</li>
        </ol>
      </div>

      <div className="flex gap-4">
        <Button asChild>
          <a href="https://teams.microsoft.com" target="_blank" rel="noopener noreferrer">
            Open Teams
          </a>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/settings">Go to Settings</Link>
        </Button>
      </div>
    </div>
  );
}