"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useSWR from "swr";
import type { MultiAccountEmailsResponse } from "@/app/api/user/settings/multi-account/route";
import { LoadingContent } from "@/components/LoadingContent";
import { MailIcon } from "lucide-react";
import { cn } from "@/utils";
import { AddEmailAccount } from "@/components/AddEmailAccount";

interface AccountSwitcherProps {
  className?: string;
}

export function AccountSwitcher({ className }: AccountSwitcherProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [activeEmail, setActiveEmail] = useState<string | null>(null);

  const { data, isLoading, error } = useSWR<MultiAccountEmailsResponse>(
    "/api/user/settings/multi-account",
  );

  useEffect(() => {
    if (session?.user?.email) {
      setActiveEmail(session.user.email);
    }
  }, [session?.user?.email]);

  const handleAccountChange = async (email: string) => {
    if (email === "add-account") {
      // This will be handled by the AddEmailAccount component instead
      return;
    }

    // Call the API to switch the active account
    try {
      const response = await fetch("/api/user/switch-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        // Refresh the session to update the current user
        router.refresh();
      } else {
        console.error("Failed to switch account");
      }
    } catch (error) {
      console.error("Error switching account:", error);
    }
  };

  // Create array of all available accounts
  const availableAccounts = data?.users || [];

  // If there's only one account (current user) don't show the switcher
  if (availableAccounts.length <= 1) return null;

  return (
    <div className={cn("relative", className)}>
      <LoadingContent loading={isLoading} error={error}>
        <Select
          value={activeEmail || undefined}
          onValueChange={handleAccountChange}
        >
          <SelectTrigger className="w-[200px] border-none bg-transparent">
            <SelectValue placeholder="Select an account" />
          </SelectTrigger>
          <SelectContent>
            {availableAccounts.map((account) => (
              <SelectItem key={account.email} value={account.email}>
                <div className="flex items-center gap-2">
                  <MailIcon className="h-4 w-4" />
                  <span className="truncate">{account.email}</span>
                </div>
              </SelectItem>
            ))}
            <SelectItem value="add-account" asChild>
              <div className="mt-1 border-t border-border pt-1">
                <AddEmailAccount
                  variant="ghost"
                  className="h-8 w-full justify-start px-2 py-0"
                >
                  Add another account
                </AddEmailAccount>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </LoadingContent>
    </div>
  );
}
