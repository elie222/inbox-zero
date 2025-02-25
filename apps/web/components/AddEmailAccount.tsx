"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { cn } from "@/utils";
import { toastError } from "@/components/Toast";

interface AddEmailAccountProps {
  variant?: "default" | "outline" | "ghost";
  className?: string;
  children?: React.ReactNode;
}

export function AddEmailAccount({
  variant = "default",
  className,
  children,
}: AddEmailAccountProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAddAccount = async () => {
    try {
      setIsLoading(true);

      // Call our custom API endpoint to start the account linking flow
      const response = await fetch("/api/user/add-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start account linking");
      }

      const result = await response.json();

      // Redirect to the Google OAuth URL
      window.location.href = result.authUrl;
    } catch (error) {
      console.error("Error starting account linking flow:", error);
      toastError({
        title: "Error adding email account",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      onClick={handleAddAccount}
      disabled={isLoading}
      className={cn("flex items-center gap-2", className)}
    >
      {isLoading ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <PlusIcon className="h-4 w-4" />
      )}
      {children || "Add Email Account"}
    </Button>
  );
}
